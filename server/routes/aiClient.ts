const apiKey = Deno.env.get("OPENAI_API_KEY");
const apiBaseUrl = Deno.env.get("OPENAI_BASE_URL");
const model = Deno.env.get("OPENAI_MODEL");

export function analyzeStream(prompt: string) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          stream: true,
          messages: [
            {
              role: "system",
              content:
                "请生成电拖测验分析报告，包括排故思路、操作效率、知识薄弱点、改进建议和学习重点。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return;
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const line = decoder.decode(value, { stream: true });
        if (!line.startsWith("data: ")) {
          continue;
        }
        const data = line.slice(6);

        const content = JSON.parse(data).choices?.[0]?.delta?.content;
        if (content) {
          controller.enqueue(encoder.encode(content));
        }
      }
      controller.close();
    },
  });
  return stream;
}
