export type Gender = "WOMAN" | "MAN" | "NONBINARY";

export interface Me {
  id: string;
  email: string;
  displayName: string;
  birthDate: string;
  gender: Gender;
  seeking: Gender[];
  city: string;
  bio: string;
  photos: PhotoRef[];
  answerCount: number;
  certainty: number;
  role: "USER" | "ADMIN";
  emailDigest: boolean;
  emailVerified: boolean;
  decisionsLearned: number;
  preferenceShifts: PreferenceShift[];
}

export interface PreferenceShift {
  dimension: string;
  direction: "more" | "less";
}

export interface DailyQuestion {
  id: string;
  text: string;
  answered: boolean;
}

export interface TodayQuestions {
  day: string;
  remaining: number;
  questions: DailyQuestion[];
}

export interface AnswerValues {
  self: number;
  partner: number;
  importance: number;
}

export interface AnswerResult {
  remaining: number;
  certainty: number;
}

export interface Match {
  id: string;
  score: number;
  confidence: number;
  aligned: string[];
  friction: string;
  person: { id: string; displayName: string; age: number; city: string; bio: string; photos: PhotoRef[] };
  decision: "LIKE" | "PASS" | null;
  mutual: boolean;
}

export interface TodayMatches {
  day: string;
  matches: Match[];
}

export interface ChatMessage {
  id: string;
  body: string;
  fromMe: boolean;
  createdAt: string;
}

export interface ChatSummary {
  id: string;
  matchedOn: string;
  person: { id: string; displayName: string; age: number; city: string; photo: string | null };
  lastMessage: ChatMessage | null;
  unread: boolean;
}

export interface Inbox {
  newMatches: number;
  unreadChats: number;
  emailVerified?: boolean;
}

export interface ChatThread {
  person: { id: string; displayName: string; photo: string | null };
  messages: ChatMessage[];
}

export type ReportReason = "SPAM" | "HARASSMENT" | "FAKE_PROFILE" | "UNDERAGE" | "OTHER";

export interface ReportedPerson {
  id: string;
  displayName: string;
  email: string;
  joinedAt: string;
  banned: boolean;
  reportsAgainst: number;
}

export interface AdminReport {
  id: string;
  reason: ReportReason;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  outcome: "DISMISSED" | "BANNED" | null;
  matchedOn: string;
  reporter: ReportedPerson;
  reported: ReportedPerson;
  messages: { from: "reporter" | "reported"; body: string; sentAt: string }[];
}

export interface PhotoRef {
  id: string;
  width: number;
  height: number;
}
