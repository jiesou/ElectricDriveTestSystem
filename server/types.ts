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
    question?: Question; // 用于 start、answer
    trouble?: Trouble; // 用于 answer
    isCorrect?: boolean; // 用于 answer
    score?: number; // 用于 finish
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

// ==================== WebSocket 消息类型 ====================
export interface WSMessage {
  type: string;
  timestamp?: number; // in seconds
  [key: string]: unknown;
}

// WebSocket 消息处理器类型
export type WSMessageHandler = (client: Client, socket: WebSocket, message: WSMessage) => void;

/* XX RequestMessage       客户机->服务器 的消息 */
/* XX UpdateRequestMessage 客户机->服务器 更新数据 */
/* XX PullRequestMessage   客户机->服务器 请求拉取新数据 */
/* XX PushMessage          客户机<-服务器 要求更新某数据 */
export interface PingRequestMessage extends WSMessage {
  type: "ping";
}

export interface PongMessage extends WSMessage {
  type: "pong";
}

// ==================== 元信息更新 ====================

export interface RelayRainbowMessage extends WSMessage {
  type: "relay_rainbow";
}

export interface AckRelayRainbowRequestMessage extends WSMessage {
  type: "ack_relay_rainbow";
}

// client 除了 IP、ID 之外，还有 name。后端的 name 默认为 IP
export interface ClientNameUpdateRequestMessage extends WSMessage {
  type: "client_name_update_request";
  name: string;
}

// 服务器返回 client 的新 name
export interface ClientNamePushMessage extends WSMessage {
  type: "client_name_push";
  name: string;
}

// ==================== TroubleTest 排故测验相关 ====================

// 服务器通知客户机更新排故测验信息（用于开始测验，也可确保不丢失排故测验进度）
export interface TroubleTestPushMessage extends WSMessage {
  type: "trouble_test_push";
  all_questions: Question[];
  start_time: number;
  duration_time: number | null;
}

export interface TroubleTestPullRequestMessage extends WSMessage {
  type: "trouble_test_pull_request";
}

// 客户机请求更新服务器上的排故测验信息（胖客户端，逻辑在客户端）
export interface TroubleTestUpdateRequestMessage extends WSMessage {
  type: "trouble_test_update_request";
  all_questions: Question[];
  start_time: number;
  duration_time: number | null;
  finish_time?: number; // 完成时间戳（秒），未完成为 null
  finished_score: number; // 完成后的最终得分（满分 100，未完成为 0）
}

// 服务器要求客户机结束测试
export interface TroubleTestFinishMessage extends WSMessage {
  type: "trouble_test_finish";
}

// ==================== EvaluateFunctionBoard 功能评估相关 ====================

// ESP32 客户机更新装接评估-功能部分的 Board 状态
export interface EvaluateFunctionBoardUpdateRequestMessage extends WSMessage {
  type: "evaluate_function_board_update_request";
  description: string;
  function_steps: EvaluateFunctionStep[];
}

// ESP32 客户机请求装接评估
export interface EvaluateWiringYoloRequestMessage extends WSMessage {
  type: "evaluate_wiring_yolo_request";
}

// 服务器返回装接评估结果给ESP32客户机
export interface EvaluateWiringYoloPushMessage extends WSMessage {
  type: "evaluate_wiring_yolo_push";
  result: {
    no_sleeves_num: number;
    cross_num: number;
    excopper_num: number;
    exterminal_num: number;
    scores: number;
  };
}

// ==================== FaceSignin 人脸签到相关 ====================

// ESP32 客户机请求人脸签到
// export interface FaceSigninRequestMessage extends WSMessage {
//   type: "face_signin_request";
// }

// 服务器返回人脸签到结果给ESP32客户机
export interface FaceSigninResultPushMessage extends WSMessage {
  type: "face_signin_result_push";
  who: string;
}

// 写死的类型
// 默认 troubles，当执行目录下没有 troubles.json 时使用
const DEFAULT_TROUBLES: Trouble[] = [
  { id: 1, description: "101 和 102 断路", from_wire: 101, to_wire: 102 },
  { id: 2, description: "102 和 103 断路", from_wire: 102, to_wire: 103 },
  { id: 3, description: "103 和 104 断路", from_wire: 103, to_wire: 104 },
  { id: 4, description: "104 和 105 断路", from_wire: 104, to_wire: 105 },
  { id: 5, description: "201 和 202 断路", from_wire: 201, to_wire: 202 },
  { id: 6, description: "（故障解析 等待中，展示默认故障）", from_wire: 202, to_wire: 203 },
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

// ==================== CV 机器视觉客户机映射配置 ====================

// CV客户机映射表配置项
export interface CvClientMapConfig {
  clientIp: string; // 普通客户机IP
  cvClientIp: string; // CV客户机IP
  cvClientType: "esp32cam" | "jetson_nano"; // CV客户机类型
}

// 默认CV客户机映射表（当cvClientMap.json不存在时使用）
const DEFAULT_CV_CLIENT_MAP: CvClientMapConfig[] = [];

// 从cvClientMap.json加载CV客户机映射表
export const CV_CLIENT_MAP: CvClientMapConfig[] = (() => {
  const tryLoad = (): CvClientMapConfig[] | null => {
    try {
      const filePath = `${Deno.cwd()}/cvClientMap.json`;

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

      return parsed as CvClientMapConfig[];
    } catch (_err) {
      // 任何异常都回退到默认
      return null;
    }
  };

  const loaded = tryLoad();
  if (loaded) {
    try {
      console.log('[types] Loaded CV_CLIENT_MAP from cvClientMap.json');
    } catch (_e) {
      // 忽略日志打印错误
    }
    return loaded;
  }

  return DEFAULT_CV_CLIENT_MAP;
})();

// Utility function
export function getSecondTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
