import "server-only";

export function trustedProxyHops(setting = "0"): number {
  if (!/^\d+$/.test(setting)) throw new Error(`TRUSTED_PROXY_HOPS="${setting}" isn't a whole number of proxies`);
  return Number(setting);
}

export function apiUrl(setting: string | undefined, production: boolean): string {
  if (!setting) {
    if (production) throw new Error("API_URL isn't set, so the web app doesn't know where the API is");
    return "http://localhost:3100";
  }
  const url = URL.parse(setting);
  if (!url || !/^https?:$/.test(url.protocol)) {
    throw new Error(`API_URL="${setting}" isn't an http or https address`);
  }
  return setting.replace(/\/+$/, "");
}

export const TRUSTED_PROXY_HOPS = trustedProxyHops(process.env.TRUSTED_PROXY_HOPS);

export function apiBaseUrl(): string {
  return apiUrl(process.env.API_URL, process.env.NODE_ENV === "production");
}
