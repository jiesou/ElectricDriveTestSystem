---
applyTo: '**'
trigger: always_on
---

# 总体要求
- 瘦服务端、胖客户端策略：前后端沟通的核心是 WebSocket 和 JSON。后端负责出题、发题、记录操作、显示结果。前端网页负责显示状态。客户端单片机负责核心逻辑，包括答题、判断正误、继电器动作、上一题下一题、计算分数，客户端单片机会自动把最新结果发给服务端，服务端只需要接收、存储到对应 client 的 testSession 中即可。
- 所有代码都要注意对多个客户机（客户端）连接同一个 WebSocket 接口的支持。即同时管理多个 WebSocket 连接。
- 涉及到的全部时间，都直接使用 number 秒级时间戳，不使用任何特定时间格式，便于客户端单片机处理。
- 不要 Overengineering！不要 Overengineering！不要 Overengineering！保持代码实现简短简单。如果可能，减少代码的更改。
- 中文注释。

# 环境变量可用
OPENAI_API_KEY="******"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="deepseek-r1-distill-llama-8b"

# AiAnalyzeModel 的实现

- 应当流式响应，流式显示，使用 marked 渲染 Markdown
- 应当 fetch 后端 /api/generator/analyze 接口，传入 clientId
- AiAnalyzeModel 应当在 App.vue menuItems 中添加一个新的菜单项来打开（导航栏上打开分析功能）

# TypeScript 类型定义
> 应当基于 Client 类型定义，来拼接数据，拼接完整的分析提示词

```ts
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
  cvClient?: CvClient; // 关联的CV客户端
  evaluateBoard?: EvaluateBoard; // 装接评估-功能部分的当前Board状态
}

// ==================== CV机器视觉相关类型 ====================

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

export interface EvaluateBoard {
  description: string;
  function_steps: EvaluateFuncationStep[];
}

export interface EvaluateFuncationStep {
  description: string;
  can_wait_for_ms: number;
  waited_for_ms: number;

  passed: boolean;
  finished: boolean;
};

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
    who: string; // 识别到的人员名称
  };
}

// CV客户端基类接口
export interface CvClient {
  clientType: "esp32cam" | "jetson_nano";
  ip: string;
  session?: EvaluateWiringSession | FaceSigninSession; // 当前会话
  latest_frame?: Uint8Array; // 最新接收到的 JPEG 帧数据
}

// ESP32-CAM客户端
export interface ESPCAMClient extends CvClient {
  clientType: "esp32cam";
}

// Jetson Nano客户端
export interface JetsonNanoClient extends CvClient {
  clientType: "jetson_nano";
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

// ==================== CV机器视觉WebSocket消息类型 ====================

// ESP32客户端更新装接评估-功能部分的Board状态
export interface EvaluateFunctionBoardUpdateMessage extends WSMessage {
  type: "evaluate_function_board_update";
  description: string;
  function_steps: EvaluateFuncationStep[];
}

// ESP32客户端请求装接评估
export interface EvaluateWiringYoloRequestMessage extends WSMessage {
  type: "evaluate_wiring_yolo_request";
}

// 服务器返回装接评估结果给ESP32客户端
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
```
