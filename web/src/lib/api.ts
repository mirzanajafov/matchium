import "server-only";
import { redirect } from "next/navigation";
import { getToken } from "./session";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

function messageFrom(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || !("message" in data)) return undefined;
  const { message } = data as { message: unknown };
  if (Array.isArray(message)) return String(message[0]);
  return typeof message === "string" ? message : undefined;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, messageFrom(data) ?? response.statusText);
  return data as T;
}

export async function authedApi<T>(path: string, options: Omit<RequestOptions, "token"> = {}): Promise<T> {
  const token = await getToken();
  if (!token) redirect("/login");
  try {
    return await api<T>(path, { ...options, token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/session/expired");
    throw error;
  }
}
