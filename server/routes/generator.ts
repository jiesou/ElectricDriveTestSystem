import { Router } from "@oak/oak";
import { clientManager } from "../ClientManager.ts";
import { TestLog, Client, Trouble, Question } from "../types.ts";

export const generatorRouter = new Router({ prefix: "/generator" });

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") || "";
const openaiApiBaseUrl = Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1";
const openaiModel = Deno.env.get("OPENAI_MODEL") || "gpt-3.5-turbo";
function formatLogEntry(log: TestLog, index: number): string {
  const time = new Date(log.timestamp * 1000).toLocaleString("zh-CN");
  let detail = "";
  
  switch (log.action) {
    case "start":
      detail = `开始测验 - 题目: ${log.details.question?.id}`;
      break;
    case "answer":
      detail = `选择故障${log.details.trouble?.id} (${log.details.trouble?.description}) - ${log.details.result ? "正确✓" : "错误✗"}`;
      break;
    case "navigation":
      detail = `切换到${log.details.direction === "next" ? "下一题" : "上一题"}`;
      break;
    case "finish":
      detail = `完成测验 - 得分: ${log.details.score}`;
      break;
    case "connect":
      detail = "连接服务器";
      break;
    case "disconnect":
      detail = "断开连接";
      break;
    default:
      detail = "未知操作";
  }
  
  return `${index + 1}. [${time}] ${log.action.toUpperCase()}: ${detail}`;
}

function buildPrompt(client: Client): string {
  const markdown: string[] = [];
  
  markdown.push("# 电力拖动测试系统 - 综合结果分析\n");
  markdown.push("请分析以下学生的测验和装接评估表现，给出详细的评价和建议。\n");
  
  markdown.push(`## 学生: ${client.name} (${client.ip})\n`);
  
  // 排故测验信息
  if (client.testSession) {
    const session = client.testSession;
    markdown.push("### 排故测验\n");
    
    // 基本信息
    markdown.push("#### 基本信息");
    const startTime = new Date(session.test.startTime * 1000).toLocaleString("zh-CN");
    const finishTime = session.finishTime 
      ? new Date(session.finishTime * 1000).toLocaleString("zh-CN")
      : "未完成";
    const duration = session.finishTime
      ? Math.floor((session.finishTime - session.test.startTime) / 60)
      : "N/A";
    
    markdown.push(`- 开始时间: ${startTime}`);
    markdown.push(`- 完成时间: ${finishTime}`);
    markdown.push(`- 用时: ${duration} 分钟`);
    markdown.push(`- 最终得分: ${session.finishedScore || "未完成"}/100`);
    markdown.push(`- 题目数量: ${session.test.questions.length}`);
    
    // 题目信息
    markdown.push("\n#### 测验题目");
    session.test.questions.forEach((question: Question, idx: number) => {
      markdown.push(`**题目 ${idx + 1} (ID: ${question.id})**`);
      markdown.push("所设故障:");
      question.troubles.forEach((trouble: Trouble) => {
        markdown.push(`  - 故障${trouble.id}: ${trouble.description}`);
      });
      
      // 显示该题的解决情况
      const solvedEntry = session.solvedTroubles.find(([qIdx]) => qIdx === idx);
      if (solvedEntry && solvedEntry[1].length > 0) {
        markdown.push("正确解决:");
        solvedEntry[1].forEach((trouble) => {
          markdown.push(`  - 故障${trouble.id}: ${trouble.description}`);
        });
      } else {
        markdown.push("该题未解决任何故障");
      }
      markdown.push("");
    });
    
    // 操作日志
    markdown.push("\n#### 详细操作日志");
    markdown.push(`共 ${session.logs.length} 条操作记录:\n`);
    session.logs.forEach((log, idx) => {
      markdown.push(formatLogEntry(log, idx));
    });
    markdown.push("");
  }
  
  // 装接评估-功能部分
  if (client.evaluateBoard) {
    const board = client.evaluateBoard;
    markdown.push("### 装接评估-功能测试\n");
    markdown.push(`**电路名称**: ${board.description}\n`);
    
    const totalSteps = board.function_steps.length;
    const finishedSteps = board.function_steps.filter(s => s.finished).length;
    const passedSteps = board.function_steps.filter(s => s.passed).length;
    
    markdown.push(`- 总步骤数: ${totalSteps}`);
    markdown.push(`- 完成步骤数: ${finishedSteps}`);
    markdown.push(`- 通过步骤数: ${passedSteps}`);
    markdown.push(`- 通过率: ${totalSteps > 0 ? ((passedSteps / totalSteps) * 100).toFixed(1) : 0}%\n`);
    
    markdown.push("#### 各步骤详情:");
    board.function_steps.forEach((step, idx) => {
      const status = step.finished 
        ? (step.passed ? "✓ 通过" : "✗ 失败")
        : "⏳ 进行中";
      const waitTime = (step.waited_for_ms / 1000).toFixed(1);
      const maxWaitTime = (step.can_wait_for_ms / 1000).toFixed(1);
      
      markdown.push(`${idx + 1}. ${step.description}`);
      markdown.push(`   - 状态: ${status}`);
      markdown.push(`   - 等待时间: ${waitTime}s / ${maxWaitTime}s`);
      if (step.finished && !step.passed) {
        markdown.push(`   - 原因: 超时或未达到预期目标`);
      }
    });
    markdown.push("");
  }
  
  // 装接评估-视觉推理部分
  if (client.cvClient && client.cvClient.session) {
    const cvSession = client.cvClient.session;
    markdown.push("### 装接评估-视觉检测\n");
    
    if (cvSession.type === "evaluate_wiring") {
      markdown.push("**评估类型**: 装接工艺检测\n");
      
      const wiringSession = cvSession;
      if (wiringSession.shots && wiringSession.shots.length > 0) {
        markdown.push(`- 拍摄次数: ${wiringSession.shots.length}\n`);
        
        markdown.push("#### 各次拍摄结果:");
        wiringSession.shots.forEach((shot, idx) => {
          const shotTime = new Date(shot.timestamp * 1000).toLocaleString("zh-CN");
          markdown.push(`**第 ${idx + 1} 次拍摄** (${shotTime})`);
          markdown.push(`- 已标号码管数量: ${shot.result.sleeves_num}`);
          markdown.push(`- 交叉接线数量: ${shot.result.cross_num}`);
          markdown.push(`- 露铜数量: ${shot.result.excopper_num}`);
          markdown.push(`- 露端子数量: ${shot.result.exterminal_num}`);
          markdown.push("");
        });
      }
      
      if (wiringSession.finalResult) {
        markdown.push("#### 最终评估结果:");
        markdown.push(`- 未标号码管总数: ${wiringSession.finalResult.no_sleeves_num}`);
        markdown.push(`- 交叉接线总数: ${wiringSession.finalResult.cross_num}`);
        markdown.push(`- 露铜总数: ${wiringSession.finalResult.excopper_num}`);
        markdown.push(`- 露端子总数: ${wiringSession.finalResult.exterminal_num}`);
        markdown.push(`- **最终评分**: ${wiringSession.finalResult.scores}/100`);
        markdown.push("");
      }
    }
  }
  
  markdown.push("---");
  
  markdown.push("\n## 分析要求");
  markdown.push("请针对以上数据进行综合分析，包括但不限于：");
  markdown.push("1. 每位学生的整体表现评价（综合排故测验和装接评估）");
  markdown.push("2. 排故测验表现：操作效率分析（答题速度、错误率等）、知识点掌握情况");
  markdown.push("3. 装接评估表现：功能测试完成情况、操作规范性、工艺质量");
  markdown.push("4. 改进建议和学习重点");

  const text = markdown.join("\n");
  console.log(text);
  return text;
}


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

  const client = clientManager.clients[clientId];

  if (!client) {
    ctx.response.status = 404;
    ctx.response.body = "Client not found";
    return;
  }

  const prompt = buildPrompt(client);

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
                "你是一个专业的电力拖动教学分析助手。请分析学生的测验表现，并提供包含同学排故思路、操作效率、知识薄弱点的针对性的学习建议。回答要简洁明了，重点突出。",
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
