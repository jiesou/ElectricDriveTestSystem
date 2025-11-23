// Shared type definitions - imported from server types
// This ensures consistency across client and server

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

// 装接评估-功能部分的步骤
export interface EvaluateFunctionStep {
  description: string;
  can_wait_for_ms: number;
  waited_for_ms: number;
  passed: boolean;
  finished: boolean;
}

// 装接评估-功能部分的Board
export interface EvaluateBoard {
  description: string;
  function_steps: EvaluateFunctionStep[];
}

// CV会话基类接口
export interface CvSession {
  type: "evaluate_wiring" | "face_signin";
  startTime: number;
}

// 拍摄记录接口
export interface WiringShot {
  timestamp: number; // 拍摄时间戳(秒)
  image: string; // 图片数据（base64或URL）
  result: {
    sleeves_num: number; // 已标号码管数量
    cross_num: number; // 交叉接线数量
    excopper_num: number; // 露铜数量
    exterminal_num: number; // 露端子数量
  };
}

// 装接评估会话
export interface EvaluateWiringSession extends CvSession {
  type: "evaluate_wiring";
  shots: WiringShot[]; // 拍摄记录数组
  finalResult?: {
    no_sleeves_num: number; // 未标号码管总数
    cross_num: number; // 交叉接线总数
    excopper_num: number; // 露铜总数
    exterminal_num: number; // 露端子数量
    scores: number; // 评分
  };
}

// 人脸签到会话
export interface FaceSigninSession extends CvSession {
  type: "face_signin";
  finalResult?: {
    who: string; // 识别到的人员名称
    image: string; // 识别时的照片(base64)
  };
}

// CV客户端接口
export interface CvClient {
  clientType: "esp32cam" | "jetson_nano";
  ip: string;
  session?: EvaluateWiringSession | FaceSigninSession;
}

export interface Client {
  id: string;
  name: string;
  ip: string;
  online: boolean;
  testSession?: TestSession;
  cvClient?: CvClient;
  evaluateBoard?: EvaluateBoard; // 装接评估-功能部分的当前Board状态
  relayRainbowTimestamp?: number; // relay_rainbow 发送时间戳，用于计算回环延迟
}

// Utility function to get integer second timestamp
export function getSecondTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}