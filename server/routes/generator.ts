import { Router } from "@oak/oak";
import { clientManager } from "../ClientManager.ts";
export const generatorRoutes = new Router( {prefix: "/generator"} );

function buildPrompt(clientId: string): string {
    let prompt = "你需要根据以下测验情况分析用户的知识掌握情况，并给出改进建议：\n\n";
    const client = clientManager.clients[clientId];
    prompt += `用户I: ${client.name}\n`;
    prompt += `测验时间: ${client.testSession?.finishTime ? new Date(client.testSession.finishTime).toLocaleString() : "未完成"}\n`;
    prompt += `测验得分: ${client.testSession?.finishedScore ?? "未完成"}\n`;
    prompt += `已解决的问题: ${client.testSession?.solvedTroubles.map(([q, _t]) => `Q${q}`).join(", ") || "未完成"}\n`;
    prompt += `未解决的问题: ${client.testSession?.test.questions.map((q, i) => `Q${i + 1}`).filter(q => !client.testSession?.solvedTroubles.map(([q, _t]) => `Q${q}`).includes(q)).join(", ") || "未完成"}\n`;

    console.log("Generated Prompt:", prompt);
    return prompt;
}

generatorRoutes.post("/analyze", async (ctx) => {
    const { clientId } = await ctx.request.body.json();
    if (!clientId) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing clientId parameter" };
        return;
    }

    const prompt = buildPrompt(clientId);

    fetch(Deno.env.get("AI_API_URL") || "http://localhost:8000/generate", {

    const stream = new ReadableStream();
    ctx.response.body = stream;
});
