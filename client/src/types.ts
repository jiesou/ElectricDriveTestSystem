// Shared type definitions - imported from server types
// This ensures consistency across client and server

export interface Trouble {
  id: number;
  description: string;
}

export interface Question {
  id: number;
  troubles: number[]; // trouble IDs
}

export interface TestSession {
  sessionId?: string; // For API compatibility
  id?: string; // Server-side compatibility
  clientId: string;
  clientIp: string;
  questionIds: number[];
  questions?: Question[]; // Server-side field
  startTime: number; // timestamp in seconds
  durationTime?: number | null; // duration in seconds, null means no time limit
  endTime?: number; // timestamp when session ended (early finish or timeout)
  currentQuestionIndex: number;
  totalQuestions: number;
  remainingTroubles: number[]; // troubles not yet solved for current question
  logs?: TestLog[]; // activity logs
}

export interface TestLog {
  timestamp: number; // seconds timestamp
  action: 'start' | 'answer' | 'navigation' | 'finish';
  details: {
    questionNumber?: number;
    troubleId?: number;
    result?: boolean;
    direction?: 'next' | 'prev';
    timeDiff?: number; // time since last action in seconds
  };
}

export interface Client {
  id: string;
  ip: string;
  session?: {
    currentQuestion: number;
    totalQuestions: number;
    remainingTroubles: number[];
    startTime: number;
    endTime?: number;
    durationTime?: number | null;
    logs?: TestLog[];
  } | null;
}

// Utility function to get integer second timestamp
export function getSecondTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}