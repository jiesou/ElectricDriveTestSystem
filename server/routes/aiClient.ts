const apiKey = Deno.env.get("OPENAI_API_KEY");
const baseUrl = Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1";
const model = Deno.env.get("OPENAI_MODEL") || "gpt-3.5-turbo";

export function analyzeStream(prompt: string) {
    const stream = new ReadableStream({
        async start(controller) {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: "user", content: prompt }],
                    stream: true,
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(`AI API 请求失败 (${response.status}):`, errText);
                controller.close();
                return;
            }

            const reader = response.body?.getReader();

            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let lines = buffer.split("\n");
                buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6).trim();
                        if (data === "[DONE]") {
                            controller.close();
                            return;
                        }
                        try {
                            const json = JSON.parse(data);
                            const reasoning_content = json.choices[0].delta.reasoning_content;
                            if (reasoning_content) {
                                controller.enqueue(reasoning_content);
                            }
                            const content = json.choices[0].delta.content;
                            if (content) {
                                controller.enqueue(content);
                            }
                        } catch (e) {
                            console.error("Failed to parse JSON:", e);
                        }
                    }
                }
            }

        }
    });
    return stream;
}