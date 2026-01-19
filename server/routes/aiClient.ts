const apiKey = Deno.env.get("OPENAI_API_KEY");
const baseUrl = Deno.env.get("OPENAI_BASE_URL");
const model = "deepseek-r1-distill-llama-8b";
let reasoning_finished = false;
export function analyzeStream(prompt: string) {
  const stream = new ReadableStream({
    async start(controller) { 
      const response = await fetch(baseUrl + "/chat/completions", {
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
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      while (true) {
        const { done, value } = await reader?.read() || {};
        if (done) {
          controller.close();
          break;
        }
        const chunk = decoder.decode(value, { stream: true });
        console.log(chunk);
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
