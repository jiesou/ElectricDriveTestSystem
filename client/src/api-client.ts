import { message } from "ant-design-vue";

type ApiResult<T> = { success?: boolean; data?: T; error?: string } | T;

// 统一的轻量 fetch 封装，错误时直接提示
export async function apiJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = init.headers ? init.headers as Record<string, string> : {};
  const hasContentType = Object.keys(headers).some((k) =>
    k.toLowerCase() === "content-type"
  );
  const finalInit: RequestInit = {
    ...init,
    headers: init.body && !hasContentType
      ? { ...headers, "Content-Type": "application/json" }
      : headers,
  };

  const resp = await fetch(path, finalInit);

  const json: ApiResult<T> = await resp.json();
  if (typeof json === "object" && json) {
    const maybe = json as { success?: boolean; data?: T; error?: string };
    if ("success" in maybe) {
      if (maybe.success === false) {
        const err = maybe.error || "请求操作中";
        message.warn(err);
        throw new Error(err);
      }
      return (maybe.data ?? json) as T;
    }
  }
  return json as T;
}
