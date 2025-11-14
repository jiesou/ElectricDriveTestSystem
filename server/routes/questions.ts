import { Router } from "@oak/oak";
import { manager } from "../TestSystemManager.ts";

/**
 * 题目管理路由
 */
export const questionsRouter = new Router();

// 获取题目列表
questionsRouter.get("/questions", (ctx) => {
  ctx.response.body = {
    success: true,
    data: manager.questions,
  };
});

// 创建新题目
questionsRouter.post("/questions", async (ctx) => {
  try {
    const body = await ctx.request.body.json();
    const { troubles } = body;

    if (!Array.isArray(troubles) || troubles.length === 0) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Invalid troubles array" };
      return;
    }

    const newQuestion = manager.addQuestion({ troubles });
    ctx.response.body = {
      success: true,
      data: newQuestion,
    };
  } catch (_error) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Invalid request body" };
  }
});

// 更新题目
questionsRouter.put("/questions/:id", async (ctx) => {
  try {
    const id = parseInt(ctx.params.id!);
    const body = await ctx.request.body.json();
    const success = manager.updateQuestion(id, body);

    if (success) {
      ctx.response.body = { success: true };
    } else {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Question not found" };
    }
  } catch (_error) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Invalid request" };
  }
});

// 删除题目
questionsRouter.delete("/questions/:id", (ctx) => {
  const id = parseInt(ctx.params.id!);
  const success = manager.deleteQuestion(id);

  if (success) {
    ctx.response.body = { success: true };
  } else {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: "Question not found" };
  }
});
