// 领域层：价差申诉受理与退款额度规则（纯函数）
//
// 阻断规则（命中任一即「不予受理」）：
//   1. 小票早于该油品首次调价生效时间
//   2. 小票时间距申诉受理超过二十四小时
//   3. 与有效申诉重复（同站点、同油品、同小票时间、同成交价；驳回/不受理单不占位）
//
// 复核规则（受理成功但须写依据并复核）：
//   a. 站点当日累计退款将超过日额度
//   b. 小票时刻没有已生效的挂牌价版本（挂牌价缺失，需补证）

import type {
  Appeal,
  BlockCode,
  PriceVersion,
  ReviewCode,
  StationQuota,
} from "./types";
import { firstEffectiveAt, localDay, priceAt, round2 } from "./time";

export const BLOCK_DESCRIPTIONS: Record<BlockCode, string> = {
  BEFORE_EFFECTIVE: "小票时间早于该油品首次调价生效时间",
  OVER_24H: "小票距申诉受理已超过二十四小时",
  DUPLICATE: "存在同站点、同油品、同小票时间、同成交价的有效申诉",
};

export const REVIEW_DESCRIPTIONS: Record<ReviewCode, string> = {
  OVER_QUOTA: "站点当日累计退款超出日额度，需写依据并复核",
  LIST_PRICE_MISSING: "小票同刻挂牌价缺失（该时刻无已生效价格版本），需补证",
};

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** 应退价差：成交价高于挂牌价时退差额，否则为 0；挂牌价缺失时为 null */
export function refundOf(dealPrice: number, listPrice: number | null): number | null {
  if (listPrice === null) return null;
  return round2(Math.max(0, dealPrice - listPrice));
}

/** 有效申诉：已不予受理或已驳回的单据不再占用重复判定 */
export function isActiveAppeal(appeal: Appeal): boolean {
  return appeal.status !== "BLOCKED" && appeal.status !== "REJECTED";
}

export function isDuplicate(
  appeals: Appeal[],
  draft: { stationId: string; fuel: string; receiptAt: string; dealPrice: number },
  excludeId?: string,
): boolean {
  return appeals.some(
    (a) =>
      a.id !== excludeId &&
      isActiveAppeal(a) &&
      a.stationId === draft.stationId &&
      a.fuel === draft.fuel &&
      a.receiptAt === draft.receiptAt &&
      round2(a.dealPrice) === round2(draft.dealPrice),
  );
}

export interface IntakeDraft {
  stationId: string;
  fuel: string;
  receiptAt: string;
  dealPrice: number;
}

export interface IntakeContext {
  appeals: Appeal[];
  versions: PriceVersion[];
  quotas: StationQuota[];
  /** 受理时刻 ISO，默认当前时间 */
  nowISO: string;
}

export interface IntakeVerdict {
  blockReasons: BlockCode[];
  blocked: boolean;
  reviewFlags: ReviewCode[];
  needsReview: boolean;
  /** 受理时刻识别到的同刻挂牌价（缺失为 null） */
  listPrice: number | null;
  matchedVersionId: string | null;
  expectedRefund: number | null;
  /** 受理时刻站点当日已用额度 */
  usedToday: number;
  dailyLimit: number | null;
  /** 计入本单后的预计当日累计 */
  projectedUsage: number | null;
}

/** 受理评估：一次算清所有阻断原因与复核情形，供界面实时预判与落库共用 */
export function evaluateIntake(draft: IntakeDraft, ctx: IntakeContext): IntakeVerdict {
  const now = new Date(ctx.nowISO).getTime();
  const receipt = new Date(draft.receiptAt).getTime();

  const blockReasons: BlockCode[] = [];
  if (now - receipt > TWENTY_FOUR_HOURS_MS) blockReasons.push("OVER_24H");
  if (isDuplicate(ctx.appeals, draft)) blockReasons.push("DUPLICATE");

  const firstAt = firstEffectiveAt(ctx.versions, draft.stationId, draft.fuel);
  // 已建档但所有版本都晚于小票：小票早于首次调价生效
  if (firstAt !== null && draft.receiptAt < firstAt) blockReasons.push("BEFORE_EFFECTIVE");

  const quotaDay = localDay(new Date(ctx.nowISO));
  const usedToday = stationDayUsage(ctx.appeals, draft.stationId, quotaDay);
  const dailyLimit = quotaLimitFor(ctx.quotas, draft.stationId);

  const matched = priceAt(ctx.versions, draft.stationId, draft.fuel, draft.receiptAt);
  const listPrice = matched ? matched.listPrice : null;
  const expectedRefund = refundOf(draft.dealPrice, listPrice);
  const projectedUsage = expectedRefund === null ? null : round2(usedToday + expectedRefund);

  if (blockReasons.length > 0) {
    return {
      blockReasons,
      blocked: true,
      reviewFlags: [],
      needsReview: false,
      listPrice,
      matchedVersionId: matched ? matched.version.id : null,
      expectedRefund,
      usedToday,
      dailyLimit,
      projectedUsage,
    };
  }

  const reviewFlags: ReviewCode[] = [];
  if (!matched) reviewFlags.push("LIST_PRICE_MISSING");
  if (
    expectedRefund !== null &&
    dailyLimit !== null &&
    round2(usedToday + expectedRefund) > dailyLimit + 0.0001
  ) {
    reviewFlags.push("OVER_QUOTA");
  }

  return {
    blockReasons: [],
    blocked: false,
    reviewFlags,
    needsReview: reviewFlags.length > 0,
    listPrice,
    matchedVersionId: matched ? matched.version.id : null,
    expectedRefund,
    usedToday,
    dailyLimit,
    projectedUsage,
  };
}

/** 站点某日（yyyy-MM-dd）已通过的累计退款 */
export function stationDayUsage(appeals: Appeal[], stationId: string, day: string): number {
  return round2(
    appeals
      .filter((a) => a.status === "APPROVED" && a.stationId === stationId && a.quotaDay === day)
      .reduce((sum, a) => sum + (a.approvedRefund ?? 0), 0),
  );
}

export function quotaLimitFor(quotas: StationQuota[], stationId: string): number | null {
  return quotas.find((q) => q.stationId === stationId)?.dailyLimit ?? null;
}

/** 仅「待复核且因挂牌价缺失」且尚未补证的申诉可补证 */
export function canSupplement(appeal: Appeal): boolean {
  return (
    appeal.status === "PENDING_REVIEW" &&
    appeal.reviewFlags.includes("LIST_PRICE_MISSING") &&
    !appeal.supplementVersionId
  );
}

export interface ApprovePlan {
  approvedRefund: number;
  quotaDay: string;
  matchedVersionId: string;
}

/**
 * 复核通过前置校验：
 *  - 必须是待复核单据
 *  - 挂牌价缺失单必须已补证（补证后小票同刻可匹配到挂牌价）
 *  - 超额度单在决策当日累计额度必须仍放得下（放不下可先调高站点日额度）
 */
export function planReviewApprove(
  appeal: Appeal,
  allAppeals: Appeal[],
  versions: PriceVersion[],
  quotas: StationQuota[],
  decisionISO: string,
): { ok: true; plan: ApprovePlan } | { ok: false; reason: string } {
  if (appeal.status !== "PENDING_REVIEW") return { ok: false, reason: "仅待复核单据可执行复核" };

  const matched = priceAt(versions, appeal.stationId, appeal.fuel, appeal.receiptAt);
  if (!matched) return { ok: false, reason: "小票同刻仍无挂牌价，请先生成补证版本" };

  const refund = refundOf(appeal.dealPrice, matched.listPrice);
  if (refund === null) return { ok: false, reason: "挂牌价缺失，无法计算退款" };

  const day = localDay(new Date(decisionISO));
  const used = stationDayUsage(allAppeals, appeal.stationId, day);
  const limit = quotaLimitFor(quotas, appeal.stationId);
  if (limit !== null && round2(used + refund) > limit + 0.0001) {
    return { ok: false, reason: `决策当日已用 ${used}，加本单 ${refund} 超出日额度 ${limit}，请先调高额度` };
  }

  return {
    ok: true,
    plan: { approvedRefund: refund, quotaDay: day, matchedVersionId: matched.version.id },
  };
}

/** 普通调价：新生效时间必须晚于该站点该油品当前最新版本，防止与现版本交叠 */
export function canAdjustPrice(
  versions: PriceVersion[],
  stationId: string,
  fuel: string,
  effectiveAt: string,
): { ok: boolean; reason?: string } {
  const own = versions.filter((v) => v.stationId === stationId && v.fuel === fuel);
  const latest = own.map((v) => v.effectiveAt).sort()[own.length - 1];
  if (latest !== undefined && effectiveAt <= latest) {
    return { ok: false, reason: "生效时间必须晚于当前最新版本，覆盖历史请使用补证" };
  }
  return { ok: true };
}
