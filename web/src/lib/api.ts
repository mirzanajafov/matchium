import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getToken } from "./session";

const API_URL = process.env.API_URL ?? "http://localhost:3100";

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

const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1);

export function clientFromForwarded(header: string | null, hops = TRUSTED_PROXY_HOPS): string | undefined {
  const entries = (header ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.at(-hops) ?? entries[0];
}

async function clientAddress(): Promise<string | undefined> {
  return clientFromForwarded((await headers()).get("x-forwarded-for"));
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const client = await clientAddress();
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(client ? { "x-forwarded-for": client } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, messageFrom(data) ?? response.statusText);
  return data as T;
}

export async function uploadToApi<T>(path: string, form: FormData): Promise<T> {
  const token = await getToken();
  if (!token) redirect("/login");
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (response.status === 401) redirect("/session/expired");
  if (!response.ok) throw new ApiError(response.status, messageFrom(data) ?? response.statusText);
  return data as T;
}

export async function openApiImage(path: string): Promise<Response> {
  const token = await getToken();
  if (!token) return new Response(null, { status: 401 });
  return fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
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

export async function openApiStream(path: string, signal: AbortSignal): Promise<Response> {
  const token = await getToken();
  if (!token) return new Response(null, { status: 401 });
  return fetch(`${API_URL}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
    cache: "no-store",
    signal,
  });
}
