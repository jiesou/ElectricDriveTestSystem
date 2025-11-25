---
applyTo: '**'
---

# 总体要求
- 胖服务端、瘦客户端策略：前后端沟通的核心是 WebSocket 和 JSON。后端负责出题、发题、具体操作、汇总成绩。前端网页负责存储题库，显示状态。客户机单片机只负责同步故障（继电器）状态和输入答案请求判对错。
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


## generator 接口实现
```ts
// AI分析接口 - 支持流式响应
generatorRouter.get("/analyze", (ctx) => {
  const clientId = ctx.request.url.searchParams.get("clientId");

  if (!clientId) {
    ctx.response.status = 400;
    ctx.response.body = "clientId is required";
    return;
  }

  if (!openaiApiKey) {
    ctx.response.status = 500;
    ctx.response.body = "OpenAI API key not configured";
    return;
  }

  const prompt = buildPrompt(clientId);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // 调用 OpenAI API
      const response = await fetch(`${openaiApiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: openaiModel,
          messages: [
            {
              role: "system",
              content:
                "你是一个专业的电力拖动教学分析助手。请根据学生的测验表现，分析其知识掌握情况，指出薄弱点，并提供针对性的学习建议。回答要简洁明了，重点突出。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          stream: true,
          temperature: 0.7,
        }),
      });

      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        controller.enqueue(encoder.encode("无法读取响应流"));
        controller.close();
        return;
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              controller.close();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      controller.close();
    },
  });

  ctx.response.body = stream;
});
```

## 视觉客户端会话 html
```html
<!-- 图像显示区域 -->
<div
  style="position: relative; width: 100%; background: #f0f0f0; border-radius: 4px; overflow: hidden; min-height: 160px;">
  <!-- MJPEG 流会自动处理，加载第一帧后就会触发 load 事件 -->
  <img v-if="client.cvClient" :src="`/api/cv/stream/${client.cvClient.ip}`"
    style="width: 100%; object-fit: contain; background: #000;"
    @load="() => { if (client.cvClient) { setImageLoaded(client.cvClient.ip, true) } }" />
  <!-- 占位符：摄像头连接中，仅在图像未加载时显示 -->
  <div v-if="client.cvClient && !isImageLoaded(client.cvClient.ip)" style="
        position: absolute; 
        top: 0; 
        left: 0; 
        width: 100%; 
        height: 100%; 
        display: flex; 
        align-items: center; 
        justify-content: center;
      ">
    视觉连接中...
  </div>
</div>
<!-- 会话信息 -->
<div v-if="client.cvClient?.session"
  style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0;">
  <div style="font-size: 12px; color: #666;">
    <strong>当前会话:</strong> {{ getSessionTypeText(client.cvClient.session.type) }}
  </div>
  <div style="font-size: 12px; color: #666; margin-top: 4px;">
    <strong>开始时间:</strong> {{ new Date(client.cvClient.session.startTime * 1000).toLocaleString() }}
  </div>

  <!-- 装接评估会话详情 -->
  <div v-if="client.cvClient.session.type === 'evaluate_wiring'" style="margin-top: 8px;">
    <div v-if="!client.cvClient.session.finalResult" style="font-size: 12px; color: #1890ff;">
      📸 拍摄采集中... (已拍摄 {{ client.cvClient.session.shots?.length || 0 }} 张)
    </div>

    <!-- 显示拍摄的图像 -->
    <div v-if="client.cvClient.session.shots && client.cvClient.session.shots.length > 0"
      style="margin-top: 8px;">
      <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
        <strong>拍摄记录:</strong>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, 600px); gap: 8px;">
        <div v-for="(shot, idx) in client.cvClient.session.shots" :key="idx"
          style="border: 1px solid #d9d9d9; border-radius: 4px; overflow: hidden;">
          <img v-if="shot.image" :src="shot.image" :alt="`拍摄 ${idx + 1}`"
            style="width: 100%; object-fit: contain; background: #000; display: block;" />
          <div style="padding: 4px; font-size: 11px; background: #fafafa;">
            <div>🏷️ 标记号码管: {{ shot.result.sleeves_num }}</div>
            <div>❌ 交叉: {{ shot.result.cross_num }}</div>
            <div>🔶 露铜: {{ shot.result.excopper_num }}</div>
            <div>📌 露端子: {{ shot.result.exterminal_num }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="client.cvClient.session.finalResult" style="font-size: 12px; margin-top: 8px;">
      <div style="color: #52c41a; margin-bottom: 4px;"><strong>✅ 评估完成</strong></div>
      <div style="color: #666; margin-top: 4px;">
        <strong>得分:</strong> {{ client.cvClient.session.finalResult.scores }} 分
      </div>
      <div style="color: #666; margin-top: 4px;">
        <strong>未标号码管:</strong> {{ client.cvClient.session.finalResult.no_sleeves_num }} 个
      </div>
      <div style="color: #666; margin-top: 4px;">
        <strong>交叉接线:</strong> {{ client.cvClient.session.finalResult.cross_num }} 处
      </div>
      <div style="color: #666; margin-top: 4px;">
        <strong>露铜:</strong> {{ client.cvClient.session.finalResult.excopper_num }} 处
      </div>
      <div style="color: #666; margin-top: 4px;">
        <strong>露端子:</strong> {{ client.cvClient.session.finalResult.exterminal_num }} 处
      </div>
    </div>
  </div>

  <!-- 人脸签到会话详情 -->
  <div v-if="client.cvClient.session.type === 'face_signin'" style="margin-top: 8px;">
    <div v-if="!client.cvClient.session.finalResult" style="font-size: 12px; color: #1890ff;">
      👤 人脸识别中...
    </div>
    <div v-else style="font-size: 12px;">
      <div style="color: #52c41a; margin-bottom: 4px;"><strong>✅ 识别完成</strong></div>
      <div style="color: #666; margin-top: 4px;">
        <strong>识别为:</strong> {{ client.cvClient.session.finalResult.who }}
      </div>
    </div>
  </div>
</div>
```

