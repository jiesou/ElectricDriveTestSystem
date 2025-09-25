// Shared type definitions - imported from server types
// This ensures consistency across client and server

export interface Trouble {
  id: number;
  description: string;
}

export interface Question {
  id: number;
  troubles: Trouble[]; // Direct trouble objects instead of IDs
}

export interface Test {
  id: number;
  questions: Question[];
  startTime: number; // timestamp in seconds
  durationTime: number | null; // duration in seconds, null means no time limit
}

export interface TestSession {
  id: string;
  test: Test; // Reference to the scheduled test
  currentQuestionIndex: number;
  finishTime?: number; // timestamp when session finished (early finish or timeout)
  solvedTroubles: [number, Trouble[]][]; // Array of [questionIndex, solvedTroubles[]] pairs
  logs: TestLog[]; // activity logs
}

export interface TestLog {
  timestamp: number; // seconds timestamp
  action: 'start' | 'answer' | 'navigation' | 'finish' | 'connect' | 'disconnect';
  details: {
    question?: Question;
    trouble?: Trouble;
    result?: boolean;
    direction?: 'next' | 'prev';
  };
}

export interface Client {
  id: string;
  name: string;
  ip: string;
  online: boolean;
  testSession?: TestSession;
}

// Utility function to get integer second timestamp
export function getSecondTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}