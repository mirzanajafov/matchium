import "server-only";
import { cookies } from "next/headers";
import { PUSH_COOKIE, SESSION_COOKIE } from "./session-cookie";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
} as const;

export async function getToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function setSession(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, COOKIE_OPTIONS);
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(PUSH_COOKIE);
}

export async function getPushEndpoint(): Promise<string | undefined> {
  return (await cookies()).get(PUSH_COOKIE)?.value;
}

export async function rememberPushEndpoint(endpoint: string | null): Promise<void> {
  const jar = await cookies();
  if (!endpoint) {
    jar.delete(PUSH_COOKIE);
    return;
  }
  jar.set(PUSH_COOKIE, endpoint, COOKIE_OPTIONS);
}
