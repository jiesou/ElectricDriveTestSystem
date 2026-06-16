import { Hono } from "hono";
import { troubleTest } from "../TroubleTest.ts";

export const questionsRouter = new Hono();

// 获取题目列表
questionsRouter.get("/", (c) => {
  return c.json({ success: true, data: troubleTest.questions });
});

// 创建新题目
questionsRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { troubles } = body;

    if (!Array.isArray(troubles) || troubles.length === 0) {
      return c.json({ success: false, error: "Invalid troubles array" }, 400);
    }

    const newQuestion = await troubleTest.addQuestion({ troubles });
    return c.json({ success: true, data: newQuestion });
  } catch (_error) {
    return c.json({ success: false, error: "Invalid request body" }, 400);
  }
});

// 更新题目
questionsRouter.put("/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const success = await troubleTest.updateQuestion(id, body);

    if (success) {
      return c.json({ success: true });
    } else {
      return c.json({ success: false, error: "Question not found" }, 404);
    }
  } catch (_error) {
    return c.json({ success: false, error: "Invalid request" }, 400);
  }
});

// 删除题目
questionsRouter.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const success = await troubleTest.deleteQuestion(id);

  if (success) {
    return c.json({ success: true });
  } else {
    return c.json({ success: false, error: "Question not found" }, 404);
  }
});
