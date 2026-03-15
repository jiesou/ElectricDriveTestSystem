const apiKey = Deno.env.get("OPENAI_API_KEY");
const baseUrl: string = Deno.env.get("OPENAI_BASE_URL") || "";
const model = "deepseek-r1-distill-llama-8b";
let reasoning_finished = false;
export function analyzeStream(prompt: string) {
  const stream = new ReadableStream({
    async start(controller) { 
      const response = await fetch(baseUrl, {
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
              role: "user",
              content: prompt,
            }
          ]
        })
      });

      if (!response.ok) {
        console.error("DeepSeek 服务端连接识别:", response.status, await response.text());
        controller.close();
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode("*正在分析...*\n\n"));

      while (true) {
        const { done, value } = await reader?.read() || {};
        if (done) {
          controller.close();
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        const text = chunk.replace(/^data: /, "");
        const obj = JSON.parse(text);

        const content = obj.choices[0].delta.content;
        if (content) {
          controller.enqueue(encoder.encode(content));
        }
        if (!reasoning_finished && content !== "") {
          reasoning_finished = true;
          controller.enqueue(encoder.encode("\n\n*深度思考已结束*\n\n"));
        }
        const reasoning_content = obj.choices[0].delta.reasoning_content;
        if (reasoning_content) {
          controller.enqueue(encoder.encode(reasoning_content));
        }

      }
      controller.close();
    },
  })
  return stream;
}
