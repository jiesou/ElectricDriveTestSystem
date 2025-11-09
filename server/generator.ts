import { Client, TestLog, Question } from "./types.ts";
import { Router } from "@oak/oak";
import { manager } from "./TestSystemManager.ts";

interface OpenAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function getOpenAIConfig(): OpenAIConfig {
  return {
    apiKey: Deno.env.get("OPENAI_API_KEY") || "",
    baseUrl: Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1",
    model: Deno.env.get("OPENAI_MODEL") || "gpt-3.5-turbo",
  };
}

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

function buildPrompt(clients: Client[]): string {
  const markdown: string[] = [];
  
  markdown.push("# 电力拖动测试系统 - 测验结果分析\n");
  markdown.push("请分析以下学生的测验表现，给出详细的评价和建议。\n");
  
  for (const client of clients) {
    if (!client.testSession) continue;
    
    const session = client.testSession;
    markdown.push(`## 学生: ${client.name} (${client.ip})\n`);
    
    // 基本信息
    markdown.push("### 基本信息");
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
    markdown.push("\n### 测验题目");
    session.test.questions.forEach((question: Question, idx: number) => {
      markdown.push(`**题目 ${idx + 1} (ID: ${question.id})**`);
      markdown.push("包含故障:");
      question.troubles.forEach((trouble) => {
        markdown.push(`  - 故障${trouble.id}: ${trouble.description}`);
      });
      
      // 显示该题的解决情况
      const solvedEntry = session.solvedTroubles.find(([qIdx]) => qIdx === idx);
      if (solvedEntry && solvedEntry[1].length > 0) {
        markdown.push("已解决:");
        solvedEntry[1].forEach((trouble) => {
          markdown.push(`  - 故障${trouble.id}: ${trouble.description}`);
        });
      } else {
        markdown.push("未解决任何故障");
      }
      markdown.push("");
    });
    
    // 操作日志
    markdown.push("\n### 详细操作日志");
    markdown.push(`共 ${session.logs.length} 条操作记录:\n`);
    session.logs.forEach((log, idx) => {
      markdown.push(formatLogEntry(log, idx));
    });
    
    markdown.push("\n---\n");
  }
  
  markdown.push("\n## 分析要求");
  markdown.push("请针对以上数据进行分析，包括但不限于：");
  markdown.push("1. 每位学生的整体表现评价");
  markdown.push("2. 操作效率分析（答题速度、错误率等）");
  markdown.push("3. 知识点掌握情况（哪些故障类型容易出错）");
  markdown.push("4. 改进建议");
  
  return markdown.join("\n");
}

async function* streamGenerate(prompt: string): AsyncGenerator<string> {
  const config = getOpenAIConfig();
  
  if (!config.apiKey) {
    yield "错误: 未配置 OPENAI_API_KEY 环境变量";
    return;
  }
  
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        stream: true,
        temperature: 0.7,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI response error: ${response.status} ${errorText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body reader");
    }
    
    const decoder = new TextDecoder();
    let buffer = "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        
        if (trimmed.startsWith("data: ")) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            console.error("Failed to parse SSE data:", e, trimmed);
          }
        }
      }
    }
  } catch (error) {
    console.error("Stream generation error:", error);
    throw error;
  }
}

export const generatorRouter = new Router({ prefix: "/generator" });

generatorRouter.post("/analyze", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { clientIds } = body;

    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Invalid clientIds array" };
      return;
    }

    // Find clients and validate they have test sessions
    const clients = clientIds
      .map((id) => manager.clients[id])
      .filter((client) => client && client.testSession);

    if (clients.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = {
        success: false,
        error: "No clients found with test sessions",
      };
      return;
    }

    // Build prompt and stream response
    const prompt = buildPrompt(clients);

    // Set up SSE headers
    ctx.response.headers.set("Content-Type", "text/event-stream");
    ctx.response.headers.set("Cache-Control", "no-cache");
    ctx.response.headers.set("Connection", "keep-alive");

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of streamGenerate(prompt)) {
            controller.enqueue(encoder.encode(`${chunk}`));
          }
        } catch (error) {
          console.error("Streaming error:", error);
          // 错误直接向客户端抛出，由前端处理并返回假数据
          throw error;
        } finally {
          controller.close();
        }
      },
    });

    ctx.response.body = stream;
  } catch (error) {
    console.error("Generator API error:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Internal server error" };
  }
});
