import type { PreferenceShift } from "./types";

const DIMENSION_LABELS: Record<string, string> = {
  social_energy: "social energy",
  adventure: "adventure",
  ambition: "ambition",
  family: "family",
  tidiness: "tidiness",
  planning: "planning ahead",
  tradition: "tradition",
  activity: "staying active",
};

export function dimensionLabel(key: string): string {
  return DIMENSION_LABELS[key] ?? key.replaceAll("_", " ");
}

export function shiftSentence(shift: PreferenceShift): string {
  return `You go for ${shift.direction} ${dimensionLabel(shift.dimension)} than your answers suggest.`;
}

export function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

export function percent(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 1) * 100);
}

export function confidenceLabel(value: number): string {
  if (value < 0.3) return "Early guess";
  if (value < 0.6) return "Getting clearer";
  return "Fairly sure";
}

export function confidenceCaption(value: number): string {
  const label = confidenceLabel(value);
  return value < 0.1 ? label : `${label} · ${percent(value)}% confidence`;
}

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const FULL_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function shortDate(isoDay: string, today = new Date()): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  const text = DAY.format(date);
  return date.getUTCFullYear() === today.getUTCFullYear() ? text : `${text} ${date.getUTCFullYear()}`;
}

export function longDate(isoDay: string): string {
  return FULL_DATE.format(new Date(`${isoDay}T00:00:00Z`));
}

export function certaintyHint(value: number): string {
  if (value < 0.15) return "We barely know you yet. A few days of questions changes that fast.";
  if (value < 0.5) return "Starting to get a picture. Keep going, the early answers matter most.";
  if (value < 0.8) return "We have a decent read on you. Matches should feel less random now.";
  return "We know you pretty well at this point.";
}
