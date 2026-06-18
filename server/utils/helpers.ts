export function getSecondTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function getClientIP(
  c: { req: { header: (s: string) => string | undefined }; env?: unknown },
): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const env = c.env as { remoteAddr?: { hostname?: string } } | undefined;
  if (env?.remoteAddr?.hostname) return env.remoteAddr.hostname;
  return "unknown";
}
