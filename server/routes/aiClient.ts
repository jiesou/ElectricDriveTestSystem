import { stream } from "hono/streaming";
import type { Context } from "hono";

const baseUrl = Deno.env.get("OPENAI_BASE_URL") || "http://localhost:8000";
const apiKey = Deno.env.get("OPENAI_API_KEY") || "your_default_api_key_here";
const model = Deno.env.get("OPENAI_MODEL") || "gpt-4";

// 流式调用 AI 接口，解析上游 SSE 后把内容逐段写回响应。
// 使用 hono/streaming 的 stream()：响应体是真正的字节流（TransformStream），
// 且回调内抛错会进入 onError，便于排查，而不是静默断连。
export function analyzeStream(c: Context, prompt: string): Response {
  return stream(
    c,
    async (s) => {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI 接口错误: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("AI 接口未返回响应体");
      }

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // 只回传解析出的内容，不把原始 data: 行透传出去
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) await s.write(delta.content);
            if (delta?.reasoning_content) await s.write(delta.reasoning_content);
          } catch {
            // 跳过心跳/空行等无法解析的内容
          }
        }
      }
      
    }
  );
}
