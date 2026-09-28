"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api, authedApi } from "@/lib/api";
import type { PushSubscriptionPayload } from "@/lib/push";
import { clearSession, getPushEndpoint, getToken, rememberPushEndpoint, setSession } from "@/lib/session";
import type { AnswerResult, AnswerValues, ChatMessage, ChatThread, Inbox, ReportReason } from "@/lib/types";

export interface FormState {
  error?: string;
  done?: boolean;
  values?: Record<string, string>;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function friendly(error: ApiError): string {
  if (error.status === 409) return "That email already has an account. Try logging in.";
  if (error.status === 401) return "Wrong email or password.";
  return error.message.charAt(0).toUpperCase() + error.message.slice(1) + ".";
}

async function startSession(path: string, body: Record<string, unknown>, values: Record<string, string>) {
  try {
    const { accessToken } = await api<{ accessToken: string }>(path, { body });
    await setSession(accessToken);
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) return { error: friendly(error), values };
    throw error;
  }
  redirect("/today");
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  return startSession("/auth/login", { email, password: String(formData.get("password") ?? "") }, { email });
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
  return startSession(
    "/auth/register",
    { ...values, seeking, password: String(formData.get("password") ?? "") },
    values,
  );
}

export async function logout(): Promise<void> {
  const [token, endpoint] = await Promise.all([getToken(), getPushEndpoint()]);
  if (token && endpoint) {
    await api("/push/subscriptions", { method: "DELETE", body: { endpoint }, token }).catch(() => undefined);
  }
  if (token) await api("/auth/logout", { method: "POST", token }).catch(() => undefined);
  await clearSession();
  redirect("/");
}

export async function answerQuestion(questionId: string, values: AnswerValues): Promise<AnswerResult> {
  return authedApi<AnswerResult>(`/questions/${encodeURIComponent(questionId)}/answer`, { body: values });
}

export async function decide(matchId: string, like: boolean): Promise<{ mutual: boolean }> {
  return authedApi<{ mutual: boolean }>(`/matches/${encodeURIComponent(matchId)}/decision`, { body: { like } });
}

export async function sendMessage(matchId: string, body: string): Promise<ChatMessage | { error: string }> {
  try {
    return await authedApi<ChatMessage>(`/chats/${encodeURIComponent(matchId)}/messages`, { body: { body } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) return { error: "You're sending messages too fast. Wait a moment." };
    throw error;
  }
}

export async function fetchMessages(matchId: string, after?: string): Promise<ChatMessage[]> {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  const thread = await authedApi<ChatThread>(`/chats/${encodeURIComponent(matchId)}/messages${query}`);
  return thread.messages;
}

export async function getInbox(): Promise<Inbox> {
  return authedApi<Inbox>("/inbox");
}

export async function savePushSubscription(subscription: PushSubscriptionPayload): Promise<void> {
  await authedApi("/push/subscriptions", { body: subscription });
  await rememberPushEndpoint(subscription.endpoint);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await authedApi("/push/subscriptions", { method: "DELETE", body: { endpoint } });
  await rememberPushEndpoint(null);
}

export async function unmatch(matchId: string, report?: { reason: ReportReason; note?: string }): Promise<void> {
  await authedApi(`/matches/${encodeURIComponent(matchId)}/unmatch`, { body: report ? { report } : {} });
}

export async function deleteAccount(_: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Type your password to confirm." };
  try {
    await authedApi("/me", { method: "DELETE", body: { password } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return { error: "That password doesn't match." };
    throw error;
  }
  await clearSession();
  redirect("/");
}

export async function resolveReport(reportId: string, outcome: "DISMISSED" | "BANNED"): Promise<void> {
  await authedApi(`/admin/reports/${encodeURIComponent(reportId)}/resolve`, { body: { outcome } });
  revalidatePath("/admin");
}

export async function unsubscribeEmail(token: string): Promise<{ done: boolean; error?: string }> {
  try {
    await api(`/email/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" });
    return { done: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) return { done: false, error: "This link doesn't work anymore." };
    throw error;
  }
}

export async function setEmailDigest(enabled: boolean): Promise<void> {
  await authedApi("/me/preferences", { method: "PATCH", body: { emailDigest: enabled } });
  revalidatePath("/me");
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  try {
    await api("/auth/password/forgot", { body: { email } });
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) return { error: friendly(error), values: { email } };
    throw error;
  }
  return { done: true, values: { email } };
}

export async function resetPassword(token: string, _: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  try {
    await api("/auth/password/reset", { body: { token, password } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { error: "This link has expired or was already used. Ask for a new one." };
    }
    if (error instanceof ApiError && error.status < 500) return { error: friendly(error) };
    throw error;
  }
  return { done: true };
}

export async function resendVerification(): Promise<{ sent: boolean; error?: string }> {
  try {
    await authedApi("/auth/verify-email/resend", { method: "POST" });
    return { sent: true };
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) return { sent: false, error: "We just sent a few. Check your inbox." };
    if (error instanceof ApiError && error.status === 409) return { sent: false, error: "Your email is already confirmed." };
    throw error;
  }
}

