// 展示层：仅负责状态/事件码到中文文案的映射与时间、金额显示格式化，
// 不包含任何业务判定。

import type { AppealStatus, EventKind } from "../domain/types";

export const STATUS_LABELS: Record<AppealStatus, string> = {
  PENDING_REVIEW: "待复核",
  APPROVED: "已通过",
  BLOCKED: "不予受理",
  REJECTED: "复核驳回",
};

export const STATUS_CLASS: Record<AppealStatus, string> = {
  PENDING_REVIEW: "status-review",
  APPROVED: "status-approved",
  BLOCKED: "status-blocked",
  REJECTED: "status-rejected",
};

export const EVENT_LABELS: Record<EventKind, string> = {
  INTAKE: "受理",
  BLOCK: "阻断",
  SUPPLEMENT: "补证",
  APPROVE: "通过",
  REJECT: "驳回",
  PRICE: "调价",
  QUOTA: "额度",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO → YYYY-MM-DD HH:mm（本地时区） */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(2)} 元`;
}

export function priceText(n: number | null | undefined): string {
  if (n === null || n === undefined) return "缺失";
  return `${n.toFixed(2)} 元/升`;
}
