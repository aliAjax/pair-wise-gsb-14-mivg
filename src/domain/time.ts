// 领域层：时间工具（纯函数，可独立单测，不依赖存储与界面）

/** 转为 ISO 字符串 */
export function toISO(date: Date): string {
  return date.toISOString();
}

/**
 * datetime-local 输入值（yyyy-MM-ddTHH:mm，按浏览器本地时区）转 ISO。
 */
export function localInputToISO(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO 转 datetime-local 需要的本地 yyyy-MM-ddTHH:mm */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 本地日期 yyyy-MM-dd，额度按此日期归属 */
export function localDay(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 在 now 基础上偏移天数/小时数，返回 ISO，用于种子数据 */
export function isoAgo(days = 0, hours = 0, minutes = 0, from: Date = new Date()): string {
  return new Date(from.getTime() - (days * 24 * 60 * 60 + hours * 60 * 60 + minutes * 60) * 1000).toISOString();
}

/** 金额保留两位 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * 「同刻挂牌价」：取该站点该油品中，生效时间不晚于小票时间的最新版本。
 * 没有任何生效版本（未建档）时返回 null（= 挂牌价缺失，须写依据并复核）。
 */
export function priceAt<T extends { stationId: string; fuel: string; effectiveAt: string; listPrice: number }>(
  versions: T[],
  stationId: string,
  fuel: string,
  atISO: string,
): { listPrice: number; version: T } | null {
  const applicable = versions
    .filter((v) => v.stationId === stationId && v.fuel === fuel && v.effectiveAt <= atISO)
    .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt));
  const latest = applicable[0];
  return latest ? { listPrice: latest.listPrice, version: latest } : null;
}

/** 该站点该油品的首次调价生效时间（最早版本生效点） */
export function firstEffectiveAt(
  versions: { stationId: string; fuel: string; effectiveAt: string }[],
  stationId: string,
  fuel: string,
): string | null {
  const all = versions.filter((v) => v.stationId === stationId && v.fuel === fuel);
  if (all.length === 0) return null;
  return all.map((v) => v.effectiveAt).sort()[0] ?? null;
}
