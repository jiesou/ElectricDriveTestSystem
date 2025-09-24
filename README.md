# Electric Drive Test System

电力拖动测试系统 - 一个用于ESP32客户端的实时故障排除测试系统

## 系统架构

### 后端 (Deno + Oak)
- WebSocket服务器处理ESP32客户端连接
- RESTful API管理测试和客户端
- 实时故障状态管理和答题验证

### 前端 (Vue.js + Ant Design)
- 出题管理：创建和保存故障测试题库
- 客户端管理：监控连接的ESP32设备
- 测试管理：分发测试并实时监控答题状态

## 启动指令

### 开发环境

**后端 (端口8000)**
```bash
cd server
deno run --allow-net --allow-read --watch main.ts
```

**前端 (端口5173)**
```bash
cd client
npm install
npm run dev
```

### 生产环境

**后端**
```bash
cd server
deno run --allow-net --allow-read main.ts
```

**前端**
```bash
cd client
npm run build
# 使用任何静态文件服务器提供dist/目录
```

## ESP32客户端集成

### WebSocket连接
ESP32客户端需要连接到WebSocket端点：
```
ws://[服务器IP]:8000/ws
```

### 消息协议

#### 客户端发送消息

**连接信息**
```json
{
  "type": "client_info"
}
```

**提交答案**
```json
{
  "type": "answer",
  "faultId": 1
}
```

#### 服务器发送消息

**连接确认**
```json
{
  "type": "connected",
  "clientId": "abc123xyz",
  "timestamp": 1701234567
}
```

**测试状态更新**
```json
{
  "type": "test_state",
  "questionId": "q1",
  "questionNumber": 1,
  "totalQuestions": 3,
  "exist_troubles": [1, 2],
  "timestamp": 1701234567
}
```

**答题结果**
```json
{
  "type": "answer_result",
  "correct": true,
  "faultId": 1
}
```

**测试完成**
```json
{
  "type": "test_completed"
}
```

### ESP32示例代码框架

```cpp
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

WebSocketsClient webSocket;
int currentFaults[5] = {0}; // exist_troubles数组

void setup() {
    // WiFi连接
    WiFi.begin("SSID", "PASSWORD");
    
    // WebSocket连接
    webSocket.begin("192.168.1.100", 8000, "/ws");
    webSocket.onEvent(webSocketEvent);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    if (type == WStype_TEXT) {
        DynamicJsonDocument doc(1024);
        deserializeJson(doc, payload);
        
        if (doc["type"] == "test_state") {
            JsonArray troubles = doc["exist_troubles"];
            // 更新继电器状态以设置故障
            updateRelays(troubles);
        }
    }
}

void submitAnswer(int faultId) {
    DynamicJsonDocument doc(200);
    doc["type"] = "answer";
    doc["faultId"] = faultId;
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT(message);
}

void updateRelays(JsonArray troubles) {
    // 根据exist_troubles数组设置继电器
    for (int i = 0; i < 5; i++) {
        bool shouldActivate = false;
        for (int fault : troubles) {
            if (fault == i + 1) {
                shouldActivate = true;
                break;
            }
        }
        digitalWrite(relayPins[i], shouldActivate ? HIGH : LOW);
    }
}
```

## 故障定义

系统预定义了5种故障类型：

1. **故障 1**: 101 和 102 断路
2. **故障 2**: 102 和 103 断路  
3. **故障 3**: 103 和 104 断路
4. **故障 4**: 电机绕组故障
5. **故障 5**: 启动电容故障

## 测试流程

1. **出题**: 管理员在前端选择故障组合创建题目
2. **保存题库**: 将创建的题目保存到本地存储
3. **客户端连接**: ESP32设备连接到WebSocket服务器
4. **创建测试**: 选择题库和目标客户端创建测试会话
5. **开始测试**: 服务器向客户端发送第一题的故障状态
6. **设置故障**: ESP32根据exist_troubles数组操作继电器
7. **学生答题**: 学生通过按钮等方式输入认为的故障号
8. **验证答案**: 服务器验证答案，正确则从exist_troubles中移除
9. **继续答题**: 直到所有故障解决，进入下一题
10. **完成测试**: 所有题目完成后测试结束

## 系统特性

- ✅ **实时通信**: WebSocket确保低延迟的实时交互
- ✅ **多客户端支持**: 同时管理多个ESP32设备
- ✅ **秒级时间戳**: 使用Unix时间戳便于ESP32处理
- ✅ **瘦服务端设计**: 最小化服务器逻辑，客户端处理具体操作
- ✅ **故障状态管理**: 动态的exist_troubles数组管理
- ✅ **题目进度控制**: 支持多题目顺序测试
- ✅ **实时监控**: 前端实时显示客户端状态和答题日志

## 技术栈

- **后端**: Deno + Oak + WebSocket
- **前端**: Vue 3 + Ant Design Vue + TypeScript + Vite
- **客户端**: ESP32 + Arduino + WebSocketsClient
- **通信**: WebSocket + JSON