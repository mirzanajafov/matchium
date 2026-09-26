export type Gender = "WOMAN" | "MAN" | "NONBINARY";

export interface Me {
  id: string;
  email: string;
  displayName: string;
  birthDate: string;
  gender: Gender;
  seeking: Gender[];
  city: string;
  answerCount: number;
  certainty: number;
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
  person: { id: string; displayName: string; age: number; city: string };
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
  person: { id: string; displayName: string; age: number; city: string };
  lastMessage: ChatMessage | null;
  unread: boolean;
}

export interface Inbox {
  newMatches: number;
  unreadChats: number;
}

export interface ChatThread {
  person: { id: string; displayName: string };
  messages: ChatMessage[];
}
