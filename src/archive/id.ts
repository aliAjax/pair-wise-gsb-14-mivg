// ID 生成：优先原生 randomUUID，旧环境回退时间戳+随机串
export function uid(prefix = "id"): string {
  const g = globalThis as { crypto?: Crypto & { randomUUID?: () => string } };
  const rand =
    g.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${rand}`;
}
