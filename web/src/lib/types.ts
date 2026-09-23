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
