import type { Gender, ReportReason } from "./types";

export const GENDERS: { value: Gender; label: string; plural: string }[] = [
  { value: "WOMAN", label: "Woman", plural: "Women" },
  { value: "MAN", label: "Man", plural: "Men" },
  { value: "NONBINARY", label: "Non-binary", plural: "Non-binary" },
];

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "HARASSMENT", label: "Harassment or threats" },
  { value: "SPAM", label: "Spam or scam" },
  { value: "FAKE_PROFILE", label: "Fake profile" },
  { value: "UNDERAGE", label: "Might be under 18" },
  { value: "OTHER", label: "Something else" },
];

export function genderLabel(gender: Gender): string {
  return GENDERS.find((g) => g.value === gender)?.label ?? gender;
}

export function seekingLabel(gender: Gender): string {
  return (GENDERS.find((g) => g.value === gender)?.plural ?? gender).toLowerCase();
}

export function reasonLabel(reason: ReportReason): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}
