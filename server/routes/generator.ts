import { Router } from "@oak/oak";
import { clientManager } from "../ClientManager.ts";

export const generatorRouter = new Router({ prefix: "/generator" });

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") || "";
const openaiApiBaseUrl = Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1";
const openaiModel = Deno.env.get("OPENAI_MODEL") || "gpt-3.5-turbo";

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

  const prompt = buildPrompt(clientId);

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
                "你是一个专业的电力拖动教学分析助手。请根据学生的测验表现，分析其知识掌握情况，指出薄弱点，并提供针对性的学习建议。回答要简洁明了，重点突出。",
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
            if (data === "[DONE]") {
              controller.close();
              return;
            }

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
