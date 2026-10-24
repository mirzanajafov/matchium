import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TRUSTED_PROXY_HOPS, apiBaseUrl } from "./server-env";
import { getToken } from "./session";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Call {
  method?: string;
  body?: unknown;
  token?: string;
  accept?: string;
  signal?: AbortSignal;
}

function messageFrom(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || !("message" in data)) return undefined;
  const { message } = data as { message: unknown };
  if (Array.isArray(message)) return String(message[0]);
  return typeof message === "string" ? message : undefined;
}

export function clientFromForwarded(header: string | null, hops = TRUSTED_PROXY_HOPS): string | undefined {
  if (hops === 0) return undefined;
  const entries = (header ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.at(-hops);
}

function encode(body: unknown): BodyInit | undefined {
  if (body === undefined || body instanceof FormData) return body;
  return JSON.stringify(body);
}

async function send(path: string, call: Call): Promise<Response> {
  const client = clientFromForwarded((await headers()).get("x-forwarded-for"));
  const body = encode(call.body);
  return fetch(`${apiBaseUrl()}${path}`, {
    method: call.method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      ...(typeof body === "string" ? { "content-type": "application/json" } : {}),
      ...(call.accept ? { accept: call.accept } : {}),
      ...(call.token ? { authorization: `Bearer ${call.token}` } : {}),
      ...(client ? { "x-forwarded-for": client } : {}),
    },
    body,
    cache: "no-store",
    signal: call.signal,
  });
}

export async function api<T>(path: string, call: Call = {}): Promise<T> {
  const response = await send(path, call);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, messageFrom(data) ?? response.statusText);
  return data as T;
}

export async function authedApi<T>(path: string, call: Omit<Call, "token"> = {}): Promise<T> {
  const token = await getToken();
  if (!token) redirect("/login");
  try {
    return await api<T>(path, { ...call, token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/session/expired");
    throw error;
  }
}

export async function authedFetch(path: string, call: Omit<Call, "token"> = {}): Promise<Response> {
  const token = await getToken();
  if (!token) return new Response(null, { status: 401 });
  return send(path, { ...call, token });
}
