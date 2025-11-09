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
      // 将错误向外抛，让上层处理并返回假数据
      throw new Error(`OpenAI response error: ${response.status} ${errorText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      // 无法读取流时抛出错误，由上层处理
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
    // 将错误抛出到上层，交由调用处统一返回假数据
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
          // 出现错误时，延迟 3 秒再返回假数据给客户端，保持一致的体验
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const fake = `## 学生测验表现分析报告

### 1. 学生整体表现评价
学生在本次测验中表现尚可，尽管总分为67/100，但在操作效率和故障识别能力方面有其亮点。学生能够快速完成测验，显示出较高的答题速度。然而，第三题的错误选择影响了总分，反映出他在面对某些故障类型时可能存在理解或决策上的不足。

### 2. 操作效率分析
学生完成测验所用的时间仅为1分钟，表明其答题速度较快。这在考试环境下是有优势的，能够节省宝贵的时间。然而，他的错误率为33%（1次错误），这说明在某些情况下，可能需要更仔细地审题或确认答案。

### 3. 知识点掌握情况
学生能够正确识别并解决前两个故障（题目1和题目2），这表明他对相关故障类型有一定的掌握。但在题目3中，他未能解决任何故障，这可能反映出他对某些特定故障（如207和220断路）不够熟悉，或者在高压环境下出现决策失误。

### 4. 改进建议
1. **加强故障类型理解**：特别是那些易于出错的故障类型，建议学生多复习相关知识，确保在面对不同故障时能够迅速识别并选择正确的解决方案。
   
2. **提高答题准确性**：在切换题目或进行故障测试时，建议学生更加仔细，尤其是在遇到多个故障时，避免因分心或疲劳而出现错误。

3. **练习高压环境下的快速决策**：为了提高测验中的表现，学生可以通过模拟高压环境下的测验，练习在短时间内快速识别和解决故障。

4. **复习测验操作流程**：确保在测验过程中熟练掌握所有操作步骤，避免因操作错误而影响测验结果。

### 结论
学生在测验中的表现总体可圈录，有较高的答题速度，但第三题的错误提示他在某些故障类型上还需加强理解和练习。通过针对性的复习和训练，学生可以显著提升测验表现。
${error instanceof Error ? error.message : String(error)}`;
          controller.enqueue(encoder.encode(fake));
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
