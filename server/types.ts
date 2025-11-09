// Utility function to get integer second timestamp
export function getSecondTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// Types and interfaces
export interface Trouble {
  id: number;
  description: string;
  from_wire: number;
  to_wire: number;
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
  finishTime?: number; // timestamp when session finished (is null if not finished)
  finishedScore?: number; // final score after finishing the test (out of 100, is null if not finished)
  solvedTroubles: [number, Trouble[]][]; // Array of [questionIndex, solvedTroubles[]] pairs
  logs: TestLog[]; // activity logs
}

export interface TestLog {
  timestamp: number;
  action: "start" | "answer" | "navigation" | "finish" | "connect" | "disconnect";
  details: {
    question?: Question; // For start, navigation, answer
    trouble?: Trouble; // For answer
    result?: boolean; // For answer
    direction?: "next" | "prev"; // For navigation,
    score?: number; // For finish
  };
}

export interface Client {
  id: string;
  name: string; // Default to client IP
  ip: string;
  online: boolean;
  socket?: WebSocket; // Optional since offline clients don't have socket
  lastPing?: number; // timestamp in seconds of last application-layer ping
  testSession?: TestSession;
}

// WebSocket message types
export interface WSMessage {
  type: string;
  timestamp?: number; // in seconds
  [key: string]: unknown;
}

export interface InTestingMessage extends WSMessage {
  type: "in_testing";
  all_troubles: Trouble[];
  exist_troubles: Trouble[];
  current_question_index: number;
  total_questions: number;
  start_time: number;
  duration_time: number | null;
}

export interface PingMessage extends WSMessage {
  type: "ping";
}

export interface RelayRainbowMessage extends WSMessage {
  type: "relay_rainbow";
}

export interface AnswerMessage extends WSMessage {
  type: "answer";
  trouble_id: number;
}

export interface AnswerResultMessage extends WSMessage {
  type: "answer_result";
  result: boolean;
  trouble: Trouble;
}

export interface QuestionNavigationMessage extends WSMessage {
  type: "last_question" | "next_question";
}

export interface FinishMessage extends WSMessage {
  type: "finish";
}

export interface FinishResultMessage extends WSMessage {
  type: "finish_result";
  finished_score: number;
}

// Predefined troubles (hardcoded)
// 默认 troubles，当执行目录下没有 troubles.json 时使用
const DEFAULT_TROUBLES: Trouble[] = [
  { id: 1, description: "101 和 102 断路", from_wire: 101, to_wire: 102 },
  { id: 2, description: "102 和 103 断路", from_wire: 102, to_wire: 103 },
  { id: 3, description: "103 和 104 断路", from_wire: 103, to_wire: 104 },
  { id: 4, description: "104 和 105 断路", from_wire: 104, to_wire: 105 },
  { id: 5, description: "201 和 202 断路", from_wire: 201, to_wire: 202 },
  { id: 6, description: "202 和 203 断路", from_wire: 202, to_wire: 203 },
];

// 尝试在运行时从执行目录加载 troubles.json；若失败则回退为 DEFAULT_TROUBLES。
export const TROUBLES: Trouble[] = (() => {
  const tryLoad = (): Trouble[] | null => {
    try {
      const filePath = `${Deno.cwd()}/troubles.json`;

      let text: string | undefined;

      try {
        text = Deno.readTextFileSync!(filePath);
      } catch (_e) {
        // 文件不存在或读取失败，返回 null 以使用默认值
        return null;
      }
    if (!text) return null;

      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return null;

      return parsed as Trouble[];
    } catch (_err) {
      // 任何异常都回退到默认
      return null;
    }
  };

  const loaded = tryLoad();
  if (loaded) {
    // 运行时输出少量信息，方便排查（在服务器环境下通常可见）
    try {
      // 在一些环境中 console 可能不可用，但通常不会
      console.log('[types] Loaded TROUBLES from troubles.json');
    } catch (_e) {
      // 忽略日志打印错误
    }
    return loaded;
  }

  return DEFAULT_TROUBLES;
})();
