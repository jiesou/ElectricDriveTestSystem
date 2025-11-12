# 后端架构说明文档

## 概述

本系统现在支持两种主要功能：
1. **排故测验 (Test)** - 设置故障，考验学生的故障排除能力
2. **装接评估 (Evaluate)** - 考验学生接线功能和工艺标准，结合机器视觉评分

## 架构设计

### 1. 模块化结构

```
server/
├── routes/              # API 路由模块
│   ├── troubles.ts      # 故障管理
│   ├── questions.ts     # 题目管理
│   ├── clients.ts       # 客户机管理
│   ├── tests.ts         # 测验管理
│   ├── cv.ts           # 机器视觉接口
│   └── status.ts       # 系统状态
├── websocket/          # WebSocket 处理
│   ├── manager.ts      # 连接和状态管理
│   └── handler.ts      # 消息处理
├── types.ts            # 类型定义
├── TestSystemManager.ts # 测验系统管理
├── YoloClientManager.ts # YOLO 客户端管理
└── server.ts           # 主服务器入口
```

### 2. 客户端类型

#### 普通客户端 (Client)
- ESP32 单片机客户端
- 支持测验会话 (TestSession)
- 支持装接评估会话 (EvaluateSession)

#### YOLO 客户端 (YoloClient)
- ESP32-CAM：拍照上传，云端推理（Roboflow API）
- Jetson Nano：边缘实时推理，本地处理

### 3. 会话类型

#### 测验会话 (TestSession)
```typescript
{
  id: string;
  test: Test;
  currentQuestionIndex: number;
  solvedTroubles: [number, Trouble[]][];
  logs: TestLog[];
  finishTime?: number;
  finishedScore?: number;
}
```

#### 装接评估会话 (EvaluateWiringSession)
```typescript
{
  type: "evaluate_wiring";
  clientId: string;
  startTime: number;
  status: "active" | "completed";
  shots: [
    {
      timestamp: number;
      image: string;
      result?: {
        sleeves_num: number;  // 标号码管数量
        cross_num: number;    // 交叉连线数量
        excopper_num: number; // 露铜数量
      };
    }
  ];
  final_result?: {
    wo_sleeves_num: number; // 缺少号码管数量
    cross_num: number;      // 交叉连线总数
    excopper_num: number;   // 露铜总数
    scores: number;         // 综合得分
  };
}
```

#### 人脸签到会话 (FaceSigninSession)
```typescript
{
  type: "face_signin";
  clientId: string;
  startTime: number;
  status: "active" | "completed";
  final_result?: {
    who: string;        // 识别出的用户
    image: string;      // 识别时的图片
    confidence?: number; // 识别置信度
  };
}
```

## 工作流程

### 装接评估工作流程

1. **ESP32 客户端发起请求**
   ```json
   {
     "type": "evaluate_wiring_yolo_request"
   }
   ```

2. **服务器创建会话**
   - 找到可用的 YoloClient
   - 创建 EvaluateWiringSession
   - 返回确认消息

3. **YOLO 客户端拍照上传**
   
   **方案 A：ESP32-CAM（云端推理）**
   ```
   POST /api/cv/upload_espcam
   Body: {
     "ip": "192.168.1.100",
     "images": ["base64_image1", "base64_image2", "base64_image3"]
   }
   ```
   服务器调用 Roboflow API 进行推理

   **方案 B：Jetson Nano（边缘推理）**
   ```
   POST /api/cv/upload_jetson
   Body: {
     "ip": "192.168.1.101",
     "image": "base64_image",
     "result": {
       "sleeves_num": 10,
       "cross_num": 2,
       "excopper_num": 1
     }
   }
   ```

4. **确认完成**
   ```
   POST /api/cv/confirm_evaluate_wiring
   Body: {
     "ip": "192.168.1.100"
   }
   ```

5. **服务器计算结果并回传**
   ```json
   {
     "type": "evaluate_wiring_yolo_response",
     "session": {
       "shots": [...],
       "final_result": {
         "wo_sleeves_num": 3,
         "cross_num": 2,
         "excopper_num": 1,
         "scores": 85
       }
     }
   }
   ```

### 人脸签到工作流程

1. **ESP32 客户端发起请求**
   ```json
   {
     "type": "face_signin_request"
   }
   ```

2. **服务器创建会话**
   - 找到可用的 YoloClient
   - 创建 FaceSigninSession
   - 返回确认消息

3. **YOLO 客户端实时识别**
   ```
   POST /api/cv/upload_jetson
   Body: {
     "ip": "192.168.1.101",
     "image": "base64_image",
     "result": {
       "who": "张三",
       "confidence": 0.95
     }
   }
   ```

4. **服务器自动回传结果**
   ```json
   {
     "type": "face_signin_response",
     "result": {
       "who": "张三",
       "image": "base64_image",
       "confidence": 0.95
     }
   }
   ```

## API 接口文档

### WebSocket 消息

#### 客户端 → 服务器

| 消息类型 | 说明 | 参数 |
|---------|------|------|
| `ping` | 心跳检测 | - |
| `answer` | 提交答案 | `trouble_id: number` |
| `next_question` | 下一题 | - |
| `last_question` | 上一题 | - |
| `finish` | 完成测验 | `timestamp?: number` |
| `evaluate_wiring_yolo_request` | 装接评估请求 | - |
| `face_signin_request` | 人脸签到请求 | - |

#### 服务器 → 客户端

| 消息类型 | 说明 | 数据 |
|---------|------|------|
| `pong` | 心跳响应 | `timestamp: number` |
| `in_testing` | 测验状态广播 | 见 InTestingMessage |
| `answer_result` | 答题结果 | `result: boolean, trouble: Trouble` |
| `finish_result` | 测验完成 | `finished_score: number` |
| `evaluate_wiring_yolo_started` | 评估开始 | - |
| `evaluate_wiring_yolo_response` | 评估结果 | `session: EvaluateWiringSession` |
| `face_signin_started` | 签到开始 | - |
| `face_signin_response` | 签到结果 | `result: FaceSigninResult` |

### REST API

#### 机器视觉接口

```
POST /api/cv/upload_espcam
上传 ESP32-CAM 拍摄的图片

POST /api/cv/upload_jetson
上传 Jetson Nano 推理结果

POST /api/cv/confirm_evaluate_wiring
确认装接评估完成

GET /api/cv/status
查询机器视觉任务状态
```

#### 其他接口

所有原有接口保持不变：
- `/api/troubles` - 故障管理
- `/api/questions` - 题目管理
- `/api/clients` - 客户机管理
- `/api/tests` - 测验管理
- `/api/status` - 系统状态

## 部署说明

### 环境变量

如果使用云端推理，需要配置 Roboflow API：

```bash
# .env 文件
ROBOFLOW_API_KEY=your_api_key_here
ROBOFLOW_MODEL_ID=your_model_id
```

### 启动服务器

```bash
cd server
deno run -A --env-file main.ts
```

### 测试

```bash
# 检查类型
deno check server.ts

# 运行服务器
deno task dev
```

## 注意事项

1. **时间格式**：全部使用秒级时间戳 (number)
2. **多客户端支持**：所有功能都支持多个客户端同时连接
3. **心跳检测**：
   - 普通客户端：10 秒超时
   - YOLO 客户端：30 秒超时
4. **图片格式**：建议使用 base64 编码或图片 URL
5. **会话管理**：每个 YoloClient 同一时间只能有一个活跃会话

## 扩展开发

### 添加新的 YOLO 会话类型

1. 在 `types.ts` 中定义新的会话接口
2. 在 `YoloClientManager.ts` 中添加创建和管理方法
3. 在 `websocket/handler.ts` 中添加请求处理
4. 在 `routes/cv.ts` 中添加对应的 API 端点

### 集成其他推理服务

修改 `routes/cv.ts` 中的推理调用逻辑，替换为其他 API 服务。

## 故障排查

### 常见问题

1. **YOLO 客户端连接不上**
   - 检查 IP 是否正确
   - 确认 YOLO 客户端是否在线（查看 `/api/cv/status`）

2. **装接评估没有响应**
   - 确认是否有在线的 YOLO 客户端
   - 检查会话是否正确创建
   - 查看服务器日志

3. **图片上传失败**
   - 检查图片大小（建议 < 2MB）
   - 确认 base64 编码正确
   - 检查网络连接

### 日志

服务器会输出详细的日志信息：
- `[YoloClientManager]` - YOLO 客户端管理
- `[CV]` - 机器视觉接口
- `[WebSocket]` - WebSocket 消息处理
