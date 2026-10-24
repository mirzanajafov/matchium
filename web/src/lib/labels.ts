import type { Gender, ReportReason } from "./types";

export const GENDERS: Record<Gender, { label: string; plural: string }> = {
  WOMAN: { label: "Woman", plural: "Women" },
  MAN: { label: "Man", plural: "Men" },
  NONBINARY: { label: "Non-binary", plural: "Non-binary" },
};

export const REPORT_REASONS: Record<ReportReason, string> = {
  HARASSMENT: "Harassment or threats",
  SPAM: "Spam or scam",
  FAKE_PROFILE: "Fake profile",
  UNDERAGE: "Might be under 18",
  OTHER: "Something else",
};
