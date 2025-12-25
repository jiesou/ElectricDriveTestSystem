// 前后端共享的核心类型，保持瘦服务端、胖客户端的数据一致性
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

export interface Client {
  id: string;
  name: string;
  ip: string;
  online: boolean;
  socket?: WebSocket;
  lastPing?: number;
  testSession?: TestSession;
  cvClient?: CvClient;
  evaluateBoard?: EvaluateBoard;
}

export interface WSMessage {
  type: string;
  timestamp?: number;
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

export function getSecondTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
