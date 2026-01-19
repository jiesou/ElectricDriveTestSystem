// ==================== TroubleTest 排故测验相关 ====================
export interface Trouble {
  id: number;
  description: string;
  from_wire: number;
  to_wire: number;
  submitted_from_wire?: number | null; // 提交的故障（用于排故测验）
  submitted_to_wire?: number | null;   // 提交的故障（用于排故测验）
  submitted_correct?: boolean | null; // 提交是否正确（用于排故测验）
}

export interface Question {
  id: number;
  troubles: Trouble[]; // 直接包含 Trouble 对象数组，而不是 ID
}

// 排故测验
export interface Test {
  id: number;
  questions: Question[]; // 题目数组
  startTime: number; // 开始时间戳（秒）
  durationTime: number | null; // 持续时间（秒），null 表示不限时
}

// 排故测验会话
export interface TestSession {
  id: string;
  test: Test; // 关联的测验
  finishTime?: number; // 完成时间戳（秒），未完成为 null
  finishedScore?: number; // 完成后的最终得分（满分 100，未完成为 null）
  logs: TestLog[]; // 活动日志
}

// 排故测验日志
export interface TestLog {
  timestamp: number; // 时间戳（秒）
  action: "start" | "answer" | "finish" | "connect" | "disconnect"; // 操作类型
  details: {
    question?: Question; // For start, answer
    trouble?: Trouble; // For answer
    isCorrect?: boolean; // For answer
    score?: number; // For finish
  };
}

// ==================== EvaluateFunctionBoard 功能评估相关 ====================

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
};

// CV会话基类接口
export interface CvSession {
  type: "evaluate_wiring" | "face_signin";
  startTime: number; // 会话开始时间戳(秒)
  finalResult?: unknown; // 最终结果，类型由具体会话决定
}

// 装接评估会话中的单次拍摄记录
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
    exterminal_num: number; // 露端子总数
    scores: number; // 评分
  };
}

// 人脸签到会话
export interface FaceSigninSession extends CvSession {
  type: "face_signin";
  finalResult?: {
    image: string; // 截图数据（base64或URL）
    who: string; // 识别到的人员名称
  };
}

// ==================== 客户机实例 ====================

// 客户机实例
export interface Client {
  id: string;
  name: string; // 默认为客户机 IP
  ip: string;
  online: boolean;
  socket?: WebSocket; // 离线客户机没有 socket
  lastPing?: number; // 应用层 ping 的最后时间戳（秒）
  relayRainbowSentMs?: number; // relay_rainbow 发送时间戳（毫秒），用于计算回环延迟
  testSession?: TestSession;
  cvClient?: CvClient; // 关联的 CV 客户机
  evaluateBoard?: EvaluateBoard; // 装接评估-功能部分的当前 Board 状态
}

// CV客户机基类接口
export interface CvClient {
  clientType: "esp32cam" | "jetson_nano";
  ip: string;
  session?: EvaluateWiringSession | FaceSigninSession; // 当前会话
  latest_frame?: Uint8Array; // 最新接收到的 JPEG 帧数据
}

// ESP32-CAM客户机
export interface ESPCAMClient extends CvClient {
  clientType: "esp32cam";
}

// Jetson Nano客户机
export interface JetsonNanoClient extends CvClient {
  clientType: "jetson_nano";
}

// Utility function
export function getSecondTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}
