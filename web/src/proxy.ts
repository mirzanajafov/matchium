import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

const PRIVATE_PREFIXES = ["/today", "/matches", "/chats", "/me"];
const GUEST_ONLY = ["/login", "/signup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);

  if (!signedIn && PRIVATE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (signedIn && GUEST_ONLY.includes(pathname)) {
    return NextResponse.redirect(new URL("/today", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/today/:path*", "/matches/:path*", "/chats/:path*", "/me/:path*", "/login", "/signup"],
};
