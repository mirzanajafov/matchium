"use server";

import { revalidatePath } from "next/cache";
import { authedApi } from "@/lib/api";

export async function resolveReport(reportId: string, outcome: "DISMISSED" | "BANNED"): Promise<void> {
  await authedApi(`/admin/reports/${encodeURIComponent(reportId)}/resolve`, { body: { outcome } });
  revalidatePath("/admin");
}
