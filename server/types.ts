// 统一的核心类型定义，前后端共享
export function getSecondTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export interface Trouble {
  id: number;
  description: string;
  from_wire: number;
  to_wire: number;
  is_submitted?: boolean;
}

export interface Question {
  id: number;
  troubles: Trouble[];
}

export interface Test {
  id: number;
  questions: Question[];
  startTime: number;
  durationTime: number | null;
}

export interface TestSession {
  id: string;
  test: Test;
  currentQuestionIndex: number;
  finishTime?: number;
  finishedScore?: number;
  solvedTroubles: [number, Trouble[]][];
  logs: TestLog[];
}

export interface TestLog {
  timestamp: number;
  action: "start" | "answer" | "navigation" | "finish" | "connect" | "disconnect";
  details: {
    question?: Question;
    trouble?: Trouble;
    result?: boolean;
    direction?: "next" | "prev";
    score?: number;
  };
}

export interface EvaluateBoard {
  description: string;
  function_steps: EvaluateFunctionStep[];
}

export interface EvaluateFunctionStep {
  description: string;
  can_wait_for_ms: number;
  waited_for_ms: number;
  passed: boolean;
  finished: boolean;
}

export interface CvSession {
  type: "evaluate_wiring" | "face_signin";
  startTime: number;
  finalResult?: unknown;
}

export interface WiringShot {
  timestamp: number;
  image: string;
  result: {
    sleeves_num: number;
    cross_num: number;
    excopper_num: number;
    exterminal_num: number;
  };
}

export interface EvaluateWiringSession extends CvSession {
  type: "evaluate_wiring";
  shots: WiringShot[];
  finalResult?: {
    no_sleeves_num: number;
    cross_num: number;
    excopper_num: number;
    exterminal_num: number;
    scores: number;
  };
}

export interface FaceSigninSession extends CvSession {
  type: "face_signin";
  finalResult?: {
    who: string;
  };
}

export interface CvClient {
  clientType: "esp32cam" | "jetson_nano";
  ip: string;
  session?: EvaluateWiringSession | FaceSigninSession;
  latest_frame?: Uint8Array;
}

export interface ESPCAMClient extends CvClient {
  clientType: "esp32cam";
}

export interface JetsonNanoClient extends CvClient {
  clientType: "jetson_nano";
}

export interface Client {
  id: string;
  name: string;
  ip: string;
  online: boolean;
  socket?: WebSocket;
  lastPing?: number;
  relayRainbowSentMs?: number;
  testSession?: TestSession;
  cvClient?: CvClient;
  evaluateBoard?: EvaluateBoard;
}

export interface WSMessage {
  type: string;
  timestamp?: number;
  [key: string]: unknown;
}

export type WSMessageHandler = (client: Client, socket: WebSocket, message: WSMessage) => void;

export interface InTestingMessage extends WSMessage {
  type: "in_testing";
  all_troubles: Trouble[];
  exist_troubles: Trouble[];
  current_question_index: number;
  total_questions: number;
  start_time: number;
  duration_time: number | null;
}

export interface PingRequestMessage extends WSMessage {
  type: "ping";
}

export interface PongMessage extends WSMessage {
  type: "pong";
}

export interface RelayRainbowMessage extends WSMessage {
  type: "relay_rainbow";
}

export interface AckRelayRainbowRequestMessage extends WSMessage {
  type: "ack_relay_rainbow";
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

export interface TroubleTestPushMessage extends WSMessage {
  type: "trouble_test_push";
  all_questions: Question[];
  start_time: number;
  duration_time: number | null;
}

export interface TroubleTestUpdateRequestMessage extends WSMessage {
  type: "trouble_test_update_request";
  all_questions: Question[];
  start_time: number;
  duration_time: number | null;
  finish_time?: number;
  finished_score?: number;
}

export interface TroubleTestFinishMessage extends WSMessage {
  type: "trouble_test_finish";
}

export interface EvaluateFunctionBoardUpdateMessage extends WSMessage {
  type: "evaluate_function_board_update";
  description: string;
  function_steps: EvaluateFunctionStep[];
}

export interface EvaluateWiringYoloRequestMessage extends WSMessage {
  type: "evaluate_wiring_yolo_request";
}

export interface EvaluateWiringYoloResponseMessage extends WSMessage {
  type: "evaluate_wiring_yolo_response";
  result: {
    no_sleeves_num: number;
    cross_num: number;
    excopper_num: number;
    exterminal_num: number;
    scores: number;
  };
}

export interface FaceSigninRequestMessage extends WSMessage {
  type: "face_signin_request";
}

export interface FaceSigninResponseMessage extends WSMessage {
  type: "face_signin_response";
  who: string;
}

// 默认题库兜底
const DEFAULT_TROUBLES: Trouble[] = [
  { id: 1, description: "101 和 102 断路", from_wire: 101, to_wire: 102 },
  { id: 2, description: "102 和 103 断路", from_wire: 102, to_wire: 103 },
  { id: 3, description: "103 和 104 断路", from_wire: 103, to_wire: 104 },
  { id: 4, description: "104 和 105 断路", from_wire: 104, to_wire: 105 },
  { id: 5, description: "201 和 202 断路", from_wire: 201, to_wire: 202 },
  { id: 6, description: "202 和 203 断路", from_wire: 202, to_wire: 203 },
];

export const TROUBLES: Trouble[] = (() => {
  const tryLoad = (): Trouble[] | null => {
    try {
      const filePath = `${Deno.cwd()}/troubles.json`;
      let text: string | undefined;
      try {
        text = Deno.readTextFileSync!(filePath);
      } catch (_e) {
        return null;
      }
      if (!text) return null;
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return null;
      return parsed as Trouble[];
    } catch (_err) {
      return null;
    }
  };

  const loaded = tryLoad();
  if (loaded) {
    try {
      console.log("[types] Loaded TROUBLES from troubles.json");
    } catch (_e) {
      // ignore
    }
    return loaded;
  }
  return DEFAULT_TROUBLES;
})();

export interface CvClientMapConfig {
  clientIp: string;
  cvClientIp: string;
  cvClientType: "esp32cam" | "jetson_nano";
}

const DEFAULT_CV_CLIENT_MAP: CvClientMapConfig[] = [];

export const CV_CLIENT_MAP: CvClientMapConfig[] = (() => {
  const tryLoad = (): CvClientMapConfig[] | null => {
    try {
      const filePath = `${Deno.cwd()}/cvClientMap.json`;
      let text: string | undefined;
      try {
        text = Deno.readTextFileSync!(filePath);
      } catch (_e) {
        return null;
      }
      if (!text) return null;
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return null;
      return parsed as CvClientMapConfig[];
    } catch (_err) {
      return null;
    }
  };

  const loaded = tryLoad();
  if (loaded) {
    try {
      console.log("[types] Loaded CV_CLIENT_MAP from cvClientMap.json");
    } catch (_e) {
      // ignore
    }
    return loaded;
  }
  return DEFAULT_CV_CLIENT_MAP;
})();
