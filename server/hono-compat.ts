// Minimal Hono-compatible implementation for Deno
// This provides a Hono-like API while using Deno's native server

type Handler = (c: Context) => Response | Promise<Response>;
type ErrorHandler = (err: Error, c: Context) => Response | Promise<Response>;
type Middleware = (c: Context, next: () => Promise<void>) => Promise<void> | void;

interface Route {
  method: string;
  path: string;
  handler: Handler | Middleware;
  isMiddleware?: boolean;
}

export class Context {
  req: {
    raw: Request;
    url: string;
    method: string;
    header: (name: string) => string | undefined;
    json: () => Promise<any>;
    param: (name: string) => string;
  };
  private _params: Record<string, string> = {};
  private _response: Response | null = null;

  constructor(request: Request, params: Record<string, string> = {}) {
    this._params = params;
    this.req = {
      raw: request,
      url: request.url,
      method: request.method,
      header: (name: string) => request.headers.get(name) || undefined,
      json: () => request.json(),
      param: (name: string) => this._params[name] || "",
    };
  }

  json(data: any, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  text(text: string, status = 200): Response {
    return new Response(text, {
      status,
      headers: { "Content-Type": "text/plain" },
    });
  }

  html(html: string, status = 200): Response {
    return new Response(html, {
      status,
      headers: { "Content-Type": "text/html" },
    });
  }

  body(data: Uint8Array | ArrayBuffer, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(data as BodyInit, { status, headers });
  }

  notFound(): Response {
    return new Response("Not Found", { status: 404 });
  }
}

export class Hono {
  private routes: Route[] = [];
  private errorHandler: ErrorHandler | null = null;

  use(path: string | Middleware, ...handlers: Middleware[]): void {
    if (typeof path === "function") {
      // Global middleware
      this.routes.push({
        method: "*",
        path: "*",
        handler: path,
        isMiddleware: true,
      });
    } else {
      // Path-specific middleware
      for (const handler of handlers) {
        this.routes.push({
          method: "*",
          path,
          handler,
          isMiddleware: true,
        });
      }
    }
  }

  onError(handler: ErrorHandler): void {
    this.errorHandler = handler;
  }

  get(path: string, handler: Handler): void {
    this.routes.push({ method: "GET", path, handler });
  }

  post(path: string, handler: Handler): void {
    this.routes.push({ method: "POST", path, handler });
  }

  put(path: string, handler: Handler): void {
    this.routes.push({ method: "PUT", path, handler });
  }

  delete(path: string, handler: Handler): void {
    this.routes.push({ method: "DELETE", path, handler });
  }

  private matchPath(pattern: string, pathname: string): { match: boolean; params: Record<string, string> } {
    if (pattern === "*") {
      return { match: true, params: {} };
    }

    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);

    if (pattern !== "*" && patternParts.length !== pathParts.length) {
      return { match: false, params: {} };
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart.startsWith(":")) {
        params[patternPart.slice(1)] = pathPart;
      } else if (patternPart !== pathPart) {
        return { match: false, params: {} };
      }
    }

    return { match: true, params };
  }

  fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    try {
      // Collect middlewares
      const middlewares: Middleware[] = [];
      for (const route of this.routes) {
        if (route.isMiddleware) {
          const { match } = this.matchPath(route.path, pathname);
          if (match && (route.method === "*" || route.method === method)) {
            middlewares.push(route.handler as Middleware);
          }
        }
      }

      // Find matching route handler
      let matchedRoute: Route | null = null;
      let params: Record<string, string> = {};

      for (const route of this.routes) {
        if (!route.isMiddleware && (route.method === method || route.method === "*")) {
          const result = this.matchPath(route.path, pathname);
          if (result.match) {
            matchedRoute = route;
            params = result.params;
            break;
          }
        }
      }

      if (!matchedRoute) {
        return new Response("Not Found", { status: 404 });
      }

      const ctx = new Context(request, params);

      // Execute middlewares
      let middlewareIndex = 0;
      const executeMiddleware = async (): Promise<void> => {
        if (middlewareIndex < middlewares.length) {
          const middleware = middlewares[middlewareIndex++];
          await middleware(ctx, executeMiddleware);
        }
      };

      await executeMiddleware();

      // Execute route handler
      const response = await (matchedRoute.handler as Handler)(ctx);
      return response;
    } catch (error) {
      if (this.errorHandler) {
        const ctx = new Context(request);
        return await this.errorHandler(error as Error, ctx);
      }
      console.error("Unhandled error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  };
}

// CORS middleware
export interface CorsOptions {
  origin?: string | string[];
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
}

export function cors(options: CorsOptions = {}): Middleware {
  return async (c: Context, next: () => Promise<void>) => {
    const origin = options.origin || "*";
    const allowMethods = options.allowMethods || ["GET", "POST", "PUT", "DELETE", "OPTIONS"];
    const allowHeaders = options.allowHeaders || ["Content-Type"];

    // Store headers to add to response
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": Array.isArray(origin) ? origin.join(", ") : origin,
      "Access-Control-Allow-Methods": allowMethods.join(", "),
      "Access-Control-Allow-Headers": allowHeaders.join(", "),
    };

    if (options.credentials) {
      corsHeaders["Access-Control-Allow-Credentials"] = "true";
    }

    if (options.exposeHeaders) {
      corsHeaders["Access-Control-Expose-Headers"] = options.exposeHeaders.join(", ");
    }

    if (options.maxAge !== undefined) {
      corsHeaders["Access-Control-Max-Age"] = String(options.maxAge);
    }

    // Handle preflight request
    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      }) as any;
    }

    await next();

    // Add CORS headers to response (we need to intercept the response)
    // This is a simplified approach - a full implementation would need response interception
  };
}
