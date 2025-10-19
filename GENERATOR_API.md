# Generator API 使用说明

## 功能概述

Generator API 是一个基于 OpenAI 的大模型分析功能，可以对学生的测验结果进行智能分析，提供详细的评价和改进建议。

## 环境配置

### 必需的环境变量

在启动服务器前，需要设置以下环境变量：

```bash
export OPENAI_API_KEY="sk-e867b6a06ce34ebca55fc4f9cafef6b8"
export OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="deepseek-r1-distill-llama-8b"
```

### 启动服务器

```bash
cd server
OPENAI_API_KEY=sk-xxx OPENAI_BASE_URL=https://... OPENAI_MODEL=deepseek-r1-distill-llama-8b deno run -A server.ts
```

## API 使用

### 端点

```
POST /api/generator/analyze
```

### 请求格式

```json
{
  "clientIds": ["client-id-1", "client-id-2"]
}
```

- `clientIds`: 字符串数组，包含要分析的客户机 ID
- 只有已完成测验的客户机才会被分析

### 响应格式

响应使用 Server-Sent Events (SSE) 流式传输：

```
data: {"content":"分"}
data: {"content":"析"}
data: {"content":"内容"}
...
data: [DONE]
```

### 错误处理

如果请求失败，会返回错误消息：

```json
{
  "success": false,
  "error": "错误描述"
}
```

## 前端使用

### 在客户机监控页面

1. 导航到"客户机监控"页面
2. 查看"已结束的测验"卡片
3. 点击"大模型汇总分析"按钮
4. 等待 AI 分析结果流式显示

### 分析内容

AI 会分析以下内容：

- **整体表现评价**：学生的完成情况和得分
- **操作效率分析**：答题速度和错误率
- **知识点掌握情况**：对不同故障类型的理解
- **改进建议**：针对性的学习建议
- **横向对比**：多个学生之间的比较（如果选择多个客户机）

## 数据聚合

Generator API 会自动收集并整理以下信息：

1. **学生基本信息**
   - 客户机名称
   - IP 地址
   - 在线状态

2. **测验信息**
   - 开始时间和完成时间
   - 用时（分钟）
   - 最终得分
   - 题目数量

3. **题目详情**
   - 每道题包含的故障
   - 已解决和未解决的故障

4. **操作日志**
   - 所有操作的时间戳
   - 操作类型（开始、答题、导航、完成等）
   - 答题正确与否
   - 连接状态变化

## 技术实现

### 后端架构

```
Client Request → Router → Generator API → OpenAI API
                              ↓
                        Stream Response
                              ↓
                         Client (SSE)
```

### 模块说明

- **generator.ts**: 核心模块
  - `buildPrompt()`: 将测验数据格式化为 Markdown
  - `streamGenerate()`: 调用 OpenAI API 并流式返回结果

- **server.ts**: 路由配置
  - `/api/generator/analyze`: 分析端点
  - 支持多客户机同时分析

### 前端实现

- 使用 Fetch API 的 ReadableStream
- 实时解析 SSE 格式的数据
- 逐字符更新 UI 显示

## 注意事项

1. **API 配额**：OpenAI API 可能有使用限制和配额
2. **网络延迟**：流式响应取决于网络状况
3. **超时处理**：长时间无响应可能需要重试
4. **数据隐私**：测验数据会发送到 OpenAI 服务器

## 故障排查

### 常见问题

1. **"未配置 OPENAI_API_KEY 环境变量"**
   - 检查环境变量是否正确设置
   - 重启服务器以加载新的环境变量

2. **"No clients found with test sessions"**
   - 确保选择的客户机有已完成的测验
   - 检查 `finishTime` 字段是否存在

3. **流式响应中断**
   - 检查网络连接
   - 验证 API key 是否有效
   - 查看服务器日志获取详细错误

4. **前端显示"AI 正在分析中"但没有结果**
   - 打开浏览器开发者工具查看网络请求
   - 检查 Console 是否有 JavaScript 错误
   - 验证 SSE 响应格式是否正确

## 示例

### 使用 curl 测试

```bash
curl -N -X POST http://localhost:8000/api/generator/analyze \
  -H "Content-Type: application/json" \
  -d '{"clientIds": ["test-client-1"]}'
```

### 预期输出

```
data: {"content":"##"}
data: {"content":" 学生"}
data: {"content":"测验"}
data: {"content":"表现"}
data: {"content":"分析"}
...
data: [DONE]
```

## 扩展功能

未来可以考虑添加：

- 批量分析多个测验会话
- 自定义分析维度和指标
- 生成 PDF 报告
- 历史分析记录保存
- 分析结果缓存
