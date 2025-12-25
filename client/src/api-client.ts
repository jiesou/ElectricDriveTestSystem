import { message } from 'ant-design-vue'

type ApiResult<T> = { success?: boolean; data?: T; error?: string } | T

// 统一的轻量 fetch 封装，错误时直接提示
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = init.headers ? init.headers as Record<string, string> : {}
  const finalInit: RequestInit = {
    ...init,
    headers: init.body && !headers['Content-Type']
      ? { ...headers, 'Content-Type': 'application/json' }
      : headers,
  }

  const resp = await fetch(path, finalInit)
  if (!resp.ok) {
    message.error(`请求失败 ${resp.status}`)
    throw new Error(`Request failed ${resp.status}`)
  }

  const json = await resp.json() as ApiResult<T>
  if (typeof json === 'object' && json && 'success' in json) {
    if (json.success === false) {
      const err = (json as any).error || '请求失败'
      message.error(err)
      throw new Error(err)
    }
    return (json as any).data ?? (json as any)
  }
  return json as T
}
