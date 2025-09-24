---
applyTo: '**'
---

# 总体要求
- 瘦服务端、胖客户端策略：前后端沟通的核心是 WebSocket 和 JSON。后端只负责出题、发题、汇总成绩。
- 所有代码都要注意对多客户机（客户端）连接同一个 WebSocket 接口的支持。
- 涉及到的全部时间，都直接使用 number 秒级时间戳，不使用任何特定时间格式，便于客户端单片机处理。
- 不要 Overengineering！不要 Overengineering！不要 Overengineering！保持代码实现简短简单。如果可能，减少代码的更改。

