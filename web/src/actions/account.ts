"use server";

import { redirect } from "next/navigation";
import { ApiError, api, authedApi } from "@/lib/api";
import { clearSession, getPushEndpoint, getToken, setSession } from "@/lib/session";
import type { ActionResult, FormState } from "@/lib/types";
import { type Refusals, attempt } from "./attempt";

const TRY_AGAIN = "Something went wrong on our side. Try again in a moment.";

type AccountAnswer = { accessToken: string } | { checkEmail: true };

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

async function submitAccountForm(
  path: string,
  body: Record<string, unknown>,
  values: Record<string, string>,
  refusals: Refusals,
): Promise<FormState> {
  const answer = await attempt(() => api<AccountAnswer>(path, { body }), TRY_AGAIN, refusals);
  if (!answer.ok) return { error: answer.error, values };
  if ("checkEmail" in answer.value) return { done: true, values };
  if (await getToken()) await endSession();
  await setSession(answer.value.accessToken);
  redirect("/today");
}

async function endSession(): Promise<void> {
  const [token, endpoint] = await Promise.all([getToken(), getPushEndpoint()]);
  const warn = (step: string) => (error: unknown) => {
    console.warn(`Logging out went on without ${step}`, error);
  };
  if (token && endpoint) {
    await api("/push/subscriptions", { method: "DELETE", body: { endpoint }, token }).catch(warn("removing push"));
  }
  if (token) await api("/auth/logout", { method: "POST", token }).catch(warn("ending the API session"));
  await clearSession();
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  return submitAccountForm(
    "/auth/login",
    { email, password: String(formData.get("password") ?? "") },
    { email },
    { 401: "Wrong email or password." },
  );
}

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const seeking = formData.getAll("seeking").map(String);
  const values = {
    email: field(formData, "email"),
    displayName: field(formData, "displayName"),
    birthDate: field(formData, "birthDate"),
    gender: field(formData, "gender"),
    city: field(formData, "city"),
    seeking: seeking.join(","),
  };
  if (seeking.length === 0) return { error: "Pick at least one option for who you're looking for.", values };
  return submitAccountForm(
    "/auth/register",
    { ...values, seeking, password: String(formData.get("password") ?? "") },
    values,
    { 409: "That email already has an account. Try logging in." },
  );
}

export async function confirmSignup(token: string, _: FormState, formData: FormData): Promise<FormState> {
  return submitAccountForm(
    "/auth/confirm-signup",
    { token, password: String(formData.get("password") ?? "") },
    {},
    {
      401: "That isn't the password you chose when you signed up.",
      409: "This email already has an account. Log in instead.",
      410: "This link has expired or was already used. Sign up again to get a new one.",
    },
  );
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/");
}

export async function logoutEverywhere(): Promise<void> {
  await authedApi("/auth/logout-all", { method: "POST" });
  await clearSession();
  redirect("/login");
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  const sent = await attempt(() => api("/auth/password/forgot", { body: { email } }), TRY_AGAIN);
  return sent.ok ? { done: true, values: { email } } : { error: sent.error, values: { email } };
}

export async function resetPassword(token: string, _: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  const reset = await attempt(() => api("/auth/password/reset", { body: { token, password } }), TRY_AGAIN, {
    410: "This link has expired or was already used. Ask for a new one.",
  });
  return reset.ok ? { done: true } : { error: reset.error };
}

const RESEND_ANSWERS: Partial<Record<number, string>> = {
  409: "Your email is already confirmed.",
  429: "We just sent a few. Check your inbox.",
};

export async function resendVerification(): Promise<ActionResult<string>> {
  return attempt(async () => {
    try {
      await authedApi("/auth/verify-email/resend", { method: "POST" });
      return "Sent. Check your inbox.";
    } catch (error) {
      const answer = error instanceof ApiError ? RESEND_ANSWERS[error.status] : undefined;
      if (answer) return answer;
      throw error;
    }
  }, "Couldn't send it. Try again in a moment.");
}

export async function deleteAccount(_: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Type your password to confirm." };
  const deleted = await attempt(() => authedApi("/me", { method: "DELETE", body: { password } }), TRY_AGAIN, {
    403: "That password doesn't match.",
  });
  if (!deleted.ok) return { error: deleted.error };
  await clearSession();
  redirect("/");
}
