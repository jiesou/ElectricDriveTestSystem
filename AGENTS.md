# 总体要求
- 瘦服务端、胖客户机策略：前后端沟通的核心是 WebSocket 和 JSON。后端负责出题、发题、记录操作、显示结果。前端网页负责显示状态。客户机单片机负责核心逻辑，包括答题、判断正误、继电器动作、上一题下一题、计算分数，客户机单片机会自动把最新结果发给服务端，服务端只需要接收、存储到对应 client 的 testSession 中即可。
- 所有代码都要注意对多个客户机连接同一个 WebSocket 接口的支持。即同时管理多个 WebSocket 连接。
- cvClient 为机器视觉（摄像头）的客户端，它可以被多个普通客户机共享，同一个 cvClientIp 只对应一个 cvClient 实例，并在所有关联的普通客户机之间共用 cvClient。
- 涉及到的全部时间，都直接使用 number 秒级时间戳，不使用任何特定时间格式，便于客户机单片机处理。
- 保护性代码几乎不需要，message.error 都可以少一点，“it just work”即可，确保代码实现极度可读、代码量少、简单高效。代码的“简单，不overengineered”非常非常重要
- 不要 Overengineering！不要 Overengineering！不要 Overengineering！保持代码实现简短简单。如果可能，减少代码的更改。
- 中文注释。

# 客户端架构

## 两种客户端类型

| 类型 | 接口 | 连接方式 | 用途 |
|------|------|----------|------|
| 普通客户端 (Client) | WebSocket | 主动连接服务器 | 用户操作终端（ESP32/浏览器） |
| 视觉客户端 (CvClient) | HTTP/UDP | 被动接收请求 | 图像采集和AI处理（Jetson Nano） |

## 核心数据结构

```typescript
// ClientManager 中
clients: Record<string, Client>     // clientId -> Client
cvClients: Record<string, CvClient> // cvClientIp -> CvClient (private)

// Client 中
client.cvClient?: CvClient  // 引用，多个Client可指向同一个CvClient
```

## 绑定关系形成流程

```
服务器启动
    │
    ▼
CV_CLIENT_MAP = 加载 cvClientMap.json（静态配置数组）
clients = {}, cvClients = {}  // 都为空
    │
    ▼
普通客户端 WebSocket 连接
    │
    ▼
connectClient(ip, socket)
    │
    ├── 创建/复用 Client 实例
    │
    └── 查找 CV_CLIENT_MAP.find(m => m.clientIp === ip)
          │
          ├─ 无匹配 → Client.cvClient = undefined
          │
          └─ 有匹配 → 创建/获取 CvClient
                       │
                       ▼
                     client.cvClient = this.cvClients[cvIp]  // 绑定
```

## 关键特性

1. **延迟创建**：CvClient 只有在普通客户端连接且匹配配置时才创建
2. **对象引用**：多个 Client.cvClient 指向同一个 CvClient 对象
3. **状态共享**：CvClient 的 session、latest_frame 被所有绑定的 Client 共享

## cvClientMap.json 格式

```json
[
  { "clientIp": "192.168.100.100", "cvClientIp": "192.168.11.121", "cvClientType": "jetson_nano" }
]
```

- 支持多对一：多个 clientIp 可映射到同一个 cvClientIp
- 仅在客户端连接时生效，不预加载

---

# AI 分析模块

## 组件层级

- `AIAnalysisPage.vue` / `AIAnalysisModal.vue` → `AIAnalysis.vue`

## 调用方式

父组件通过 `ref` 调用子组件暴露的方法：

```ts
// 父组件
const aiAnalysisRef = ref<InstanceType<typeof AIAnalysis>>()
aiAnalysisRef.value?.startAnalysis(clientId)

// 子组件 AIAnalysis.vue
defineExpose({ startAnalysis, stopAnalysis, reset })
```

## 组件职责

| 组件 | 职责 |
|------|------|
| AIAnalysis.vue | 核心组件，调用后端 API，暴露 startAnalysis/stopAnalysis/reset |
| AIAnalysisModal.vue | 模态框包装，关闭时调用 reset() |
| AIAnalysisPage.vue | 页面级，含客户机/模型选择器，点击分析调用 startAnalysis() |

## 后端 API

### GET /api/generator/analyze?clientId={clientId}

流式返回 Markdown 分析报告。

错误码：400(缺少clientId) / 404(客户机不存在)

实现：`server/routes/generator.ts` → `aiClient.ts#analyzeStream`

## 相关文件

| 文件 | 说明 |
|------|------|
| `client/src/components/AIAnalysis.vue` | 核心分析组件 |
| `client/src/components/AIAnalysisModal.vue` | 模态框包装器 |
| `client/src/components/AIAnalysisPage.vue` | 页面级组件 |
| `server/routes/generator.ts` | 后端 API |
| `server/routes/aiClient.ts` | AI API 接口接入 |

## 后端环境变量可用
OPENAI_API_KEY="******"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="deepseek-r1-distill-llama-8b"
