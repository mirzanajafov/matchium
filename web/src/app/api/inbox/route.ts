import { relayJson } from "@/lib/api";

export function GET() {
  return relayJson("/inbox");
}
