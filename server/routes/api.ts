import { Router } from "@oak/oak";
import { TestSystemManager, Question } from "../types.ts";

export function createApiRoutes(manager: TestSystemManager): Router {
  const router = new Router({ prefix: "/api" });

  // Get all troubles (hardcoded list)
  router.get("/troubles", (ctx) => {
    ctx.response.body = {
      success: true,
      data: manager.getTroubles(),
    };
  });

  // Question bank management
  router.get("/questions", (ctx) => {
    ctx.response.body = {
      success: true,
      data: manager.getQuestions(),
    };
  });

  router.post("/questions", async (ctx) => {
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
    } catch (error) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Invalid request body" };
    }
  });

  router.put("/questions/:id", async (ctx) => {
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
    } catch (error) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Invalid request" };
    }
  });

  router.delete("/questions/:id", (ctx) => {
    const id = parseInt(ctx.params.id!);
    const success = manager.deleteQuestion(id);

    if (success) {
      ctx.response.body = { success: true };
    } else {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Question not found" };
    }
  });

  // Connected clients management
  router.get("/clients", (ctx) => {
    const clients = manager.getConnectedClients().map(client => ({
      id: client.id,
      ip: client.ip,
      hasSession: !!client.session,
      lastActivity: client.lastActivity,
      sessionInfo: client.session ? {
        currentQuestion: client.session.currentQuestionIndex + 1,
        totalQuestions: client.session.questions.length,
        remainingTroubles: client.session.remainingTroubles,
        startTime: client.session.startTime,
      } : null,
    }));

    ctx.response.body = {
      success: true,
      data: clients,
    };
  });

  // Test session management
  router.post("/test-sessions", async (ctx) => {
    try {
      const body = await ctx.request.body.json();
      const { clientIds, questionIds, startTime } = body;

      if (!Array.isArray(clientIds) || !Array.isArray(questionIds)) {
        ctx.response.status = 400;
        ctx.response.body = { success: false, error: "Invalid clientIds or questionIds" };
        return;
      }

      const allQuestions = manager.getQuestions();
      const selectedQuestions = allQuestions.filter(q => questionIds.includes(q.id));

      if (selectedQuestions.length !== questionIds.length) {
        ctx.response.status = 400;
        ctx.response.body = { success: false, error: "Some questions not found" };
        return;
      }

      const results: { clientId: string; success: boolean }[] = [];

      for (const clientId of clientIds) {
        const success = manager.createTestSession(clientId, selectedQuestions, startTime || Date.now() / 1000);
        results.push({ clientId, success });
      }

      ctx.response.body = {
        success: true,
        data: results,
      };
    } catch (error) {
      ctx.response.status = 400;
      ctx.response.body = { success: false, error: "Invalid request body" };
    }
  });

  // System status
  router.get("/status", (ctx) => {
    const clients = manager.getConnectedClients();
    
    ctx.response.body = {
      success: true,
      data: {
        timestamp: Date.now() / 1000,
        connectedClients: clients.length,
        activeTests: clients.filter(c => c.session).length,
        totalQuestions: manager.getQuestions().length,
        totalTroubles: manager.getTroubles().length,
      },
    };
  });

  return router;
}