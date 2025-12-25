---
applyTo: '**'
trigger: always_on
---

# 总体要求
- 瘦服务端、胖客户机策略：前后端沟通的核心是 WebSocket 和 JSON。后端负责出题、发题、记录操作、显示结果。前端网页负责显示状态。客户机单片机负责核心逻辑，包括答题、判断正误、继电器动作、上一题下一题、计算分数，客户机单片机会自动把最新结果发给服务端，服务端只需要接收、存储到对应 client 的 testSession 中即可。
- 所有代码都要注意对多个客户机连接同一个 WebSocket 接口的支持。即同时管理多个 WebSocket 连接。
- cvClient 为机器视觉（摄像头）的客户端，它可以被多个普通客户机共享，同一个 cvClientIp 只对应一个 cvClient 实例，并在所有关联的普通客户机之间共用 cvClient。
- 涉及到的全部时间，都直接使用 number 秒级时间戳，不使用任何特定时间格式，便于客户机单片机处理。
- 保护性代码几乎不需要，message.error 都可以少一点，“it just work”即可，确保代码实现极度可读、代码量少、简单高效。代码的“简单，不overengineered”非常非常重要
- 不要 Overengineering！不要 Overengineering！不要 Overengineering！保持代码实现简短简单。如果可能，减少代码的更改。
- 中文注释。

# 环境变量可用
OPENAI_API_KEY="******"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="deepseek-r1-distill-llama-8b"
