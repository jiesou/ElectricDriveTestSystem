# 电力拖动测试系统 (Electric Drive Test System)

## 项目概述
这是一个基于 WebSocket 的电力拖动测试系统，支持多个 ESP32 客户机同时连接，实现故障检测和测验管理功能。

## 技术架构
- **后端**: Deno + Oak 框架 + WebSocket
- **前端**: Vue 3 + AntDesign + Vite
- **通信**: WebSocket 实时通信 + REST API 管理接口
- **部署**: 前后端分离，支持代理配置

## 功能特性

### 核心功能
1. **故障管理**: 预定义故障列表，支持动态题库管理
2. **测验管理**: 创建测验、分发题目、实时监控
3. **多客户机支持**: 同时管理多个 ESP32 连接
4. **实时通信**: 0.5秒间隔的状态广播
5. **答题系统**: 实时验证答案，自动更新故障状态

### 预定义故障列表
1. 101 和 102 断路
2. 102 和 103 断路  
3. 103 和 104 断路
4. 104 和 105 断路
5. 201 和 202 断路
6. 202 和 203 断路

## 启动指南

### 后端服务器
```bash
cd server
deno run --allow-net --allow-read --allow-write --unstable-net main.ts
```
服务器将启动在 `http://localhost:8000`
- WebSocket 端点: `ws://localhost:8000/ws`
- API 端点: `http://localhost:8000/api`
- UDP 图传端口: `udp://0.0.0.0:8000` （需要 --unstable-net 标志）

### 前端界面
```bash
cd client
npm install
npm run dev
```
前端将启动在 `http://localhost:5173`

### ESP32 模拟器（测试用）
```bash
cd server
deno run --allow-net esp32-simulator.ts
```

## API 接口

### REST API
- `GET /api/troubles` - 获取故障列表
- `GET /api/questions` - 获取题目列表
- `POST /api/questions` - 创建新题目
- `PUT /api/questions/:id` - 更新题目
- `DELETE /api/questions/:id` - 删除题目
- `GET /api/clients` - 获取连接的客户机列表
- `POST /api/test-sessions` - 创建测验会话
- `GET /api/status` - 系统状态

### WebSocket 消息

#### 服务器 → 客户机
```json
{
  "type": "exist_troubles",
  "troubles": [1, 2],
  "current_question": 1,
  "total_questions": 3
}
```

```json
{
  "type": "answer_result",
  "result": true,
  "trouble_id": 1
}
```

#### 客户机 → 服务器
```json
{
  "type": "answer",
  "trouble_id": 1
}
```

```json
{
  "type": "next_question"
}
```

```json
{
  "type": "last_question"
}
```

## 前端界面

### 页面结构
1. **故障管理**: 查看故障列表，管理题库
2. **测验管理**: 创建测验，监控客户机状态
3. **客户机监控**: 实时查看客户机答题状态

### 主要功能
- WebSocket 连接状态显示（右上角）
- 题目的增删改查
- 测验创建和分发
- 实时客户机状态监控
- 答题进度跟踪

## 系统特点

### 架构优势
- **胖服务端，瘦客户端**: 核心逻辑在服务器端
- **实时通信**: WebSocket 确保状态同步
- **多客户机**: 支持同时管理多个 ESP32
- **模块化**: 代码结构清晰，易于维护

### 时间处理
- 统一使用秒级时间戳（number 类型）
- 方便 ESP32 单片机处理

### 错误处理
- 完善的错误捕获和处理机制
- WebSocket 断线重连
- API 调用异常处理

## 开发说明

### 代码结构
```
├── server/                 # 后端代码
│   ├── simple-server.ts   # 简化服务器入口
│   ├── types.ts           # 类型定义
│   ├── esp32-simulator.ts # ESP32 模拟器
│   └── routes/            # 路由模块
└── client/                # 前端代码
    ├── src/
    │   ├── components/    # Vue 组件
    │   └── App.vue        # 主应用
    └── vite.config.ts     # Vite 配置
```

### 主要组件
- `TestSystemManager`: 测试系统管理器
- `WebSocketStatus`: WebSocket 状态组件
- `TroubleManagement`: 故障管理组件
- `TestManagement`: 测验管理组件
- `ClientMonitoring`: 客户机监控组件

## 测试验证

系统已通过以下测试：
1. ✅ WebSocket 连接和通信
2. ✅ REST API 接口调用
3. ✅ 多客户机连接管理
4. ✅ 前端界面交互
5. ✅ ESP32 模拟器测试

## 扩展性

系统支持以下扩展：
- 增加更多故障类型
- 支持更复杂的题目结构
- 添加成绩统计功能
- 集成数据库持久化
- 支持用户认证系统