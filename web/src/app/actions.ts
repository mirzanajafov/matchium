"use server";

import { redirect } from "next/navigation";
import { ApiError, api, authedApi } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import type { AnswerResult, AnswerValues } from "@/lib/types";

export interface FormState {
  error?: string;
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
  await clearSession();
  redirect("/");
}

export async function answerQuestion(questionId: string, values: AnswerValues): Promise<AnswerResult> {
  return authedApi<AnswerResult>(`/questions/${encodeURIComponent(questionId)}/answer`, { body: values });
}

export async function decide(matchId: string, like: boolean): Promise<{ mutual: boolean }> {
  return authedApi<{ mutual: boolean }>(`/matches/${encodeURIComponent(matchId)}/decision`, { body: { like } });
}
