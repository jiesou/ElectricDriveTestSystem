# 后端架构重构文档

## 概述

本次重构主要完成了以下目标：
1. 添加了装接评估 (evaluate) 功能的架构支持
2. 集成了CV机器视觉功能（YOLO装接评估和人脸签到）
3. 将server.ts的代码模块化，实现了更好的关注点分离

## 新增数据结构

### CV客户端相关类型 (types.ts)

```typescript
// CV客户端类型
interface CvClient {
  clientType: "esp32cam" | "jetson_nano";
  ip: string;
  session?: EvaluateWiringSession | FaceSigninSession;
}

// 装接评估会话
interface EvaluateWiringSession {
  type: "evaluate_wiring";
  startTime: number;
  shots: WiringShot[];  // 拍摄记录数组
  finalResult?: {
    no_sleeves_num: number;  // 未标号码管总数
    cross_num: number;       // 交叉接线总数
    excopper_num: number;    // 露铜总数
    scores: number;          // 评分
  };
}

// 人脸签到会话
interface FaceSigninSession {
  type: "face_signin";
  startTime: number;
  finalResult?: {
    who: string;   // 识别到的人员名称
    image: string; // 识别时的照片
  };
}
```

### Client扩展

```typescript
interface Client {
  id: string;
  name: string;
  ip: string;
  online: boolean;
  socket?: WebSocket;
  lastPing?: number;
  testSession?: TestSession;
  cvClient?: CvClient;  // 新增：关联的CV客户端
}
```

## 模块结构

### ClientManager (ClientManager.ts)

职责：
- 管理WebSocket连接和客户端状态
- 处理ping/pong心跳检测
- 根据cvClientMap.json自动关联CV客户端
- 提供安全的WebSocket消息发送方法

主要方法：
- `connectClient(ip, socket)` - 连接或重连客户端
- `disconnectClient(client)` - 断开客户端连接
- `handlePing(client, socket)` - 处理ping消息
- `safeSend(socket, message)` - 安全发送WebSocket消息
- `clearAllClients()` - 清理所有客户端连接

### TestSystemManager (TestSystemManager.ts)

职责：
- 管理测验会话和题目库
- 处理答题逻辑和分数计算
- 广播测验状态给客户端

改进：
- 移除了客户端连接管理功能（转移到ClientManager）
- 通过`setClientManager()`方法与ClientManager协作
- 简化了持久化逻辑，只保存测验和题目数据

### API路由模块化

#### routes/troubles.ts
- `GET /api/troubles` - 获取故障列表

#### routes/questions.ts
- `GET /api/questions` - 获取题目列表
- `POST /api/questions` - 创建新题目
- `PUT /api/questions/:id` - 更新题目
- `DELETE /api/questions/:id` - 删除题目

#### routes/clients.ts
- `GET /api/clients` - 获取客户端列表（含cvClient信息）
- `PUT /api/clients/:id` - 修改客户端名字
- `POST /api/clients/forget` - 忘记所有客户端

#### routes/tests.ts
- `GET /api/tests` - 获取测验列表
- `POST /api/tests/finish-all` - 结束所有测验
- `POST /api/tests/clear-all` - 清除所有测验
- `POST /api/test-sessions` - 创建测验会话
- `POST /api/relay-rainbow` - 继电器功能测试广播
- `GET /api/status` - 系统状态

#### routes/cv/upload.ts
CV图片上传和结果处理路由

- `POST /api/cv/upload_wiring` - 接收装接评估的拍摄和推理结果
  ```json
  {
    "cvClientIp": "192.168.1.200",
    "image": "base64_or_url",
    "result": {
      "sleeves_num": 10,
      "cross_num": 2,
      "excopper_num": 1
    }
  }
  ```

- `POST /api/cv/confirm_wiring` - 确认装接评估，计算最终结果并返回给ESP32客户端
  ```json
  {
    "cvClientIp": "192.168.1.200"
  }
  ```

- `POST /api/cv/upload_face` - 接收人脸签到识别结果
  ```json
  {
    "cvClientIp": "192.168.1.200",
    "who": "张三",
    "image": "base64_or_url"
  }
  ```

## WebSocket消息扩展

### ESP32客户端 → 服务器

#### evaluate_wiring_yolo_request
请求装接评估
```json
{
  "type": "evaluate_wiring_yolo_request",
  "timestamp": 1234567890
}
```

#### face_signin_request
请求人脸签到
```json
{
  "type": "face_signin_request",
  "timestamp": 1234567890
}
```

### 服务器 → ESP32客户端

#### evaluate_wiring_yolo_response
返回装接评估结果
```json
{
  "type": "evaluate_wiring_yolo_response",
  "timestamp": 1234567890,
  "result": {
    "no_sleeves_num": 5,
    "cross_num": 2,
    "excopper_num": 1,
    "scores": 80
  }
}
```

#### face_signin_response
返回人脸签到结果
```json
{
  "type": "face_signin_response",
  "timestamp": 1234567890,
  "who": "张三",
  "image": "base64_or_url"
}
```

## CV工作流程

### 装接评估流程

1. ESP32客户端发送 `evaluate_wiring_yolo_request`
2. 服务器为该客户端的cvClient创建 `EvaluateWiringSession`
3. CV客户端（ESP32-CAM或Jetson Nano）拍照并调用 `POST /api/cv/upload_wiring` 上传图片和推理结果
4. 服务器记录每次拍摄到session.shots数组
5. CV客户端完成所有拍摄后，调用 `POST /api/cv/confirm_wiring`
6. 服务器计算最终结果（汇总所有shots）并通过WebSocket返回 `evaluate_wiring_yolo_response` 给ESP32客户端

### 人脸签到流程

1. ESP32客户端发送 `face_signin_request`
2. 服务器为该客户端的cvClient创建 `FaceSigninSession`
3. CV客户端实时识别人脸，当识别到人脸且置信度高于阈值时，调用 `POST /api/cv/upload_face`
4. 服务器设置session.finalResult并通过WebSocket返回 `face_signin_response` 给ESP32客户端

## 配置文件

### cvClientMap.json

定义普通客户端和CV客户端的映射关系：

```json
[
  {
    "clientIp": "192.168.1.100",
    "cvClientIp": "192.168.1.200",
    "cvClientType": "esp32cam"
  },
  {
    "clientIp": "192.168.1.101",
    "cvClientIp": "192.168.1.201",
    "cvClientType": "jetson_nano"
  }
]
```

- `clientIp`: 普通ESP32客户端的IP地址
- `cvClientIp`: CV客户端的IP地址
- `cvClientType`: CV客户端类型（"esp32cam" 或 "jetson_nano"）

## 服务器启动

```bash
cd server
deno run -A --env-file main.ts
```

## 架构优势

1. **职责分离**：ClientManager专注连接管理，TestSystemManager专注业务逻辑
2. **模块化路由**：每个功能模块独立文件，便于维护和扩展
3. **CV架构灵活**：支持两种CV客户端类型，支持两种CV会话类型
4. **配置驱动**：通过cvClientMap.json灵活配置客户端映射关系
5. **代码简洁**：server.ts只负责应用初始化和路由注册，业务逻辑在各自模块中

## 注意事项

1. 所有时间使用秒级时间戳（number类型）
2. CV推理的具体实现（YOLO、人脸识别）在CV客户端侧完成
3. 服务器主要负责会话管理、数据记录和结果汇总
4. CV客户端通过HTTP POST与服务器通信，不使用WebSocket
5. 评分算法可根据实际需求在 `routes/cv/upload.ts` 中调整
