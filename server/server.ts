import { Application, Router } from "@oak/oak";
import { TestSystemManager, WSMessage, AnswerMessage, QuestionNavigationMessage } from "./types.ts";
import { createApiRoutes } from "./routes/api.ts";
import { createWebSocketHandler } from "./routes/websocket.ts";

export class TestServer {
  private app: Application;
  private manager: TestSystemManager;

  constructor() {
    this.app = new Application();
    this.manager = new TestSystemManager();
    this.setupRoutes();
    this.setupMiddleware();
  }

  private setupMiddleware() {
    // Error handling
    this.app.use(async (ctx, next) => {
      try {
        await next();
      } catch (err) {
        console.error("Server error:", err);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
      }
    });

    // CORS
    this.app.use(async (ctx, next) => {
      ctx.response.headers.set("Access-Control-Allow-Origin", "*");
      ctx.response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      
      if (ctx.request.method === "OPTIONS") {
        ctx.response.status = 204;
        return;
      }
      
      await next();
    });

    // Disable error logging that causes issues
    this.app.addEventListener("error", (evt) => {
      // Silently ignore errors to prevent server crash
      console.log("Application error handled:", evt.error?.message || "Unknown error");
    });
  }

  private setupRoutes() {
    // WebSocket route
    const wsHandler = createWebSocketHandler(this.manager);
    this.app.use(wsHandler.routes());

    // API routes
    const apiRoutes = createApiRoutes(this.manager);
    this.app.use(apiRoutes.routes());
    this.app.use(apiRoutes.allowedMethods());

    // Health check
    const healthRouter = new Router();
    healthRouter.get("/health", (ctx) => {
      ctx.response.body = { status: "ok", timestamp: Date.now() / 1000 };
    });
    
    this.app.use(healthRouter.routes());
  }

  async start(port: number = 8000) {
    console.log(`Server starting on port ${port}`);
    console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
    console.log(`API endpoint: http://localhost:${port}/api`);
    
    await this.app.listen({ port });
  }

  stop() {
    this.manager.cleanup();
  }
}

// Start server if this file is run directly
if (import.meta.main) {
  const server = new TestServer();
  
  // Graceful shutdown
  const signals = ["SIGINT", "SIGTERM"];
  signals.forEach(signal => {
    addEventListener(signal as any, () => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);
      server.stop();
      Deno.exit(0);
    });
  });

  await server.start();
}