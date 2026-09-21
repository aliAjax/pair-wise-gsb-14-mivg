// 纯时间工具：可在规则层、测试中复用，不依赖 Vue / DOM。

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export function toIso(value: string): string {
  // datetime-local（本地时区）转 ISO
  return new Date(value).toISOString();
}

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

/** 本地自然日键，用于站点当日额度归集 */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayKey(now: Date = new Date()): string {
  return dayKey(now.toISOString());
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

/** 当前时刻对应的 datetime-local 输入框初值（本地时区） */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
