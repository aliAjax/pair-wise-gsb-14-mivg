// 价差申诉规则引擎（纯函数）。
// 只依赖 domain 类型与时间工具，不依赖 Vue、Pinia、localStorage，可独立测试。

import type {
  Appeal,
  AppealInput,
  AppealRevision,
  ArchiveData,
  BlockReason,
  BlockCode,
  Fuel,
  PriceVersion,
  ReviewReason,
  ReviewCode,
  Station,
} from "./types";
import { DAY_MS, dayKey, formatDateTime, round2 } from "./time";

// ---------- 挂牌价版本查询 ----------

export function versionsOfFuel(versions: PriceVersion[], fuel: Fuel): PriceVersion[] {
  return versions
    .filter((v) => v.fuel === fuel)
    .sort((a, b) => +new Date(a.effectiveFrom) - +new Date(b.effectiveFrom));
}

/** 小票时刻生效的版本：同油品中 effectiveFrom <= at 的最新一版 */
export function effectiveVersionAt(
  versions: PriceVersion[],
  fuel: Fuel,
  at: string
): PriceVersion | null {
  const t = +new Date(at);
  let hit: PriceVersion | null = null;
  for (const v of versionsOfFuel(versions, fuel)) {
    if (+new Date(v.effectiveFrom) <= t) hit = v;
    else break;
  }
  return hit;
}

export function earliestVersion(versions: PriceVersion[], fuel: Fuel): PriceVersion | null {
  return versionsOfFuel(versions, fuel)[0] ?? null;
}

export type PriceResolution =
  | { kind: "OK"; version: PriceVersion }
  | { kind: "EARLY"; earliest: PriceVersion }
  | { kind: "MISSING" };

/**
 * 解析小票时刻的挂牌价：
 * - OK：匹配到生效版本
 * - EARLY：该油品有价版本，但最早版本晚于小票时间（受理硬阻断）
 * - MISSING：该油品完全没有价版本（可受理但须复核确认挂牌价）
 */
export function resolvePrice(
  versions: PriceVersion[],
  fuel: Fuel,
  at: string
): PriceResolution {
  const earliest = earliestVersion(versions, fuel);
  if (!earliest) return { kind: "MISSING" };
  if (+new Date(earliest.effectiveFrom) > +new Date(at)) {
    return { kind: "EARLY", earliest };
  }
  return { kind: "OK", version: effectiveVersionAt(versions, fuel, at)! };
}

/** 追加价版本前校验：同油品生效时间不得重复 */
export function versionConflict(
  versions: PriceVersion[],
  fuel: Fuel,
  effectiveFrom: string,
  excludeId?: string
): string | null {
  const t = +new Date(effectiveFrom);
  const dup = versions.find(
    (v) => v.fuel === fuel && +new Date(v.effectiveFrom) === t && v.id !== excludeId
  );
  return dup ? `该油品在 ${formatDateTime(effectiveFrom)} 已存在价格版本` : null;
}

// ---------- 退款计算 ----------

export function calcRefund(listPrice: number, dealPrice: number, volume: number): number {
  return round2(Math.max(0, listPrice - dealPrice) * volume);
}

// ---------- 站点当日额度 ----------

/** 站点在某自然日已通过的累计退款 */
export function stationDayUsed(
  appeals: Appeal[],
  stationId: string,
  day: string
): number {
  return round2(
    appeals
      .filter(
        (a) =>
          a.status === "APPROVED" &&
          a.stationId === stationId &&
          a.approvedAt &&
          dayKey(a.approvedAt) === day
      )
      .reduce((sum, a) => sum + (a.refund ?? 0), 0)
  );
}

export function stationQuota(stations: Station[], stationId: string): number {
  return stations.find((s) => s.id === stationId)?.quota ?? 0;
}

// ---------- 受理规则 ----------

function block(code: BlockCode, detail: string): BlockReason {
  return { code, detail };
}

function review(code: ReviewCode, detail: string): ReviewReason {
  return { code, detail };
}

/** 同站点 + 同油品 + 同小票时间，且已被受理（阻断件不占位，可重新提交） */
export function findDuplicate(
  appeals: Appeal[],
  input: AppealInput
): Appeal | null {
  const t = +new Date(input.receiptAt);
  return (
    appeals.find(
      (a) =>
        a.status !== "BLOCKED" &&
        a.stationId === input.stationId &&
        a.fuel === input.fuel &&
        +new Date(a.receiptAt) === t
    ) ?? null
  );
}

export interface IntakeMeta {
  id: string;
  code: string;
  submittedAt: string;
}

/**
 * 受理录入：
 * 1. 小票早于最早调价生效 / 超过 24 小时 / 重复 → 硬阻断，不进入流程；
 * 2. 挂牌价缺失或叠加后超站点当日额度 → 待复核，须写依据；
 * 3. 其余直接通过，并冻结小票与当时价格版本。
 */
export function buildIntakeAppeal(
  input: AppealInput,
  data: Pick<ArchiveData, "priceVersions" | "appeals" | "stations">,
  meta: IntakeMeta
): Appeal {
  const receiptAt = new Date(input.receiptAt).toISOString();
  const normalized: AppealInput = { ...input, receiptAt };

  const blocks: BlockReason[] = [];

  // 规则 1a：小票早于调价生效
  const resolution = resolvePrice(data.priceVersions, input.fuel, receiptAt);
  if (resolution.kind === "EARLY") {
    blocks.push(
      block(
        "EARLY_BEFORE_PRICE",
        `小票时间 ${formatDateTime(receiptAt)} 早于该油品挂牌价最早生效时间 ${formatDateTime(
          resolution.earliest.effectiveFrom
        )}，不得受理`
      )
    );
  }

  // 规则 1b：超过 24 小时
  if (+new Date(meta.submittedAt) - +new Date(receiptAt) > DAY_MS) {
    blocks.push(
      block(
        "RECEIPT_OVERDUE",
        `小票时间 ${formatDateTime(receiptAt)} 距提交已超过 24 小时，不得受理`
      )
    );
  }

  // 规则 1c：重复受理
  const dup = findDuplicate(data.appeals, normalized);
  if (dup) {
    blocks.push(
      block(
        "DUPLICATE",
        `同站点 / 同油品 / 同小票时间的申诉已受理（编号 ${dup.code}），不得重复受理`
      )
    );
  }

  const base: Appeal = {
    id: meta.id,
    code: meta.code,
    stationId: input.stationId,
    fuel: input.fuel,
    receiptAt,
    dealPrice: input.dealPrice,
    claimedListPrice: input.claimedListPrice,
    volume: input.volume,
    status: "BLOCKED",
    blockReasons: blocks,
    reviewReasons: [],
    estimatedRefund: null,
    refund: null,
    basis: "",
    reviewer: "",
    reviewedAt: null,
    confirmedListPrice: null,
    frozenReceipt: null,
    frozenPrice: null,
    revisions: [],
    createdAt: meta.submittedAt,
    approvedAt: null,
  };

  if (blocks.length > 0) {
    return base; // 阻断件留痕展示，不占用受理名额
  }

  const reviews: ReviewReason[] = [];
  let estimatedRefund: number | null = null;
  let resolvedVersion: PriceVersion | null = null;

  if (resolution.kind === "MISSING") {
    reviews.push(
      review(
        "LIST_PRICE_MISSING",
        "小票时刻缺少可对应的挂牌价版本，须填写依据并由复核人确认挂牌价"
      )
    );
  } else if (resolution.kind === "OK") {
    // EARLY 已在上方进入阻断并提前返回，此处解析结果必为 OK
    resolvedVersion = resolution.version;
    estimatedRefund = calcRefund(
      resolvedVersion.listPrice,
      input.dealPrice,
      input.volume
    );
  }

  // 规则 2：站点当日累计退款额度
  const day = dayKey(meta.submittedAt);
  const used = stationDayUsed(data.appeals, input.stationId, day);
  const quota = stationQuota(data.stations, input.stationId);
  if (estimatedRefund !== null && round2(used + estimatedRefund) > quota) {
    reviews.push(
      review(
        "OVER_QUOTA",
        `当日已通过退款 ${used} 元，叠加本次 ${estimatedRefund} 元后超过站点当日额度 ${quota} 元，须填写依据并复核`
      )
    );
  }

  if (reviews.length > 0) {
    return {
      ...base,
      status: "PENDING_REVIEW",
      blockReasons: [],
      reviewReasons: reviews,
      estimatedRefund,
    };
  }

  // 规则 3：额度内且价格可查 → 直接通过并冻结
  return freezeAppeal(
    {
      ...base,
      blockReasons: [],
      estimatedRefund,
    },
    resolvedVersion,
    null,
    meta.submittedAt
  );
}

// ---------- 冻结 ----------

/**
 * 通过时冻结小票与当时价格版本：
 * 写入不可变快照、退款金额与 approvedAt（额度按该日归集）。
 */
export function freezeAppeal(
  appeal: Appeal,
  priceVersion: PriceVersion | null,
  confirmedListPrice: number | null,
  frozenAt: string
): Appeal {
  const listPrice = priceVersion?.listPrice ?? confirmedListPrice;
  if (listPrice === null || !Number.isFinite(listPrice) || listPrice <= 0) {
    throw new Error("冻结失败：缺少有效的挂牌价");
  }
  const refund = calcRefund(listPrice, appeal.dealPrice, appeal.volume);
  return {
    ...appeal,
    status: "APPROVED",
    refund,
    confirmedListPrice: priceVersion ? appeal.confirmedListPrice : listPrice,
    frozenReceipt: {
      stationId: appeal.stationId,
      fuel: appeal.fuel,
      receiptAt: appeal.receiptAt,
      dealPrice: appeal.dealPrice,
      claimedListPrice: appeal.claimedListPrice,
      volume: appeal.volume,
      frozenAt,
    },
    frozenPrice: {
      versionId: priceVersion?.id ?? null,
      fuel: appeal.fuel,
      listPrice,
      effectiveFrom: priceVersion?.effectiveFrom ?? null,
      frozenAt,
    },
    approvedAt: frozenAt,
  };
}

// ---------- 复核 ----------

export interface ReviewDecision {
  approve: boolean;
  basis: string;
  reviewer: string;
  /** 挂牌价缺失时复核人确认的挂牌价 */
  confirmedListPrice?: number | null;
}

/** 复核处理：通过（必要时确认挂牌价后冻结）或驳回；均须填写依据 */
export function applyReview(
  appeal: Appeal,
  versions: PriceVersion[],
  decision: ReviewDecision,
  reviewedAt: string
): Appeal {
  if (appeal.status !== "PENDING_REVIEW") {
    throw new Error("仅待复核申诉可以处理");
  }
  const basis = decision.basis.trim();
  if (!basis) throw new Error("复核必须填写依据");
  const reviewer = decision.reviewer.trim();
  if (!reviewer) throw new Error("复核必须署名");

  if (!decision.approve) {
    return {
      ...appeal,
      status: "REJECTED",
      basis,
      reviewer,
      reviewedAt,
    };
  }

  const needsPrice = appeal.reviewReasons.some(
    (r) => r.code === "LIST_PRICE_MISSING"
  );
  let confirmed: number | null = null;
  if (needsPrice) {
    confirmed = decision.confirmedListPrice ?? null;
    if (confirmed === null || !Number.isFinite(confirmed) || confirmed <= 0) {
      throw new Error("挂牌价缺失时，复核通过须确认有效的挂牌价");
    }
  }

  // 重新解析小票时刻版本（价版本台账只追加，解析结果稳定）
  const resolution = resolvePrice(versions, appeal.fuel, appeal.receiptAt);
  const priceVersion = resolution.kind === "OK" ? resolution.version : null;

  return freezeAppeal(
    {
      ...appeal,
      reviewReasons: appeal.reviewReasons,
      basis,
      reviewer,
      reviewedAt,
    },
    priceVersion,
    priceVersion ? null : confirmed,
    reviewedAt
  );
}

// ---------- 补证（通过后只追加新版本） ----------

export interface RevisionInput {
  reason: string;
  evidence: string;
  operator: string;
  at: string;
}

/** 通过后补证：原冻结数据不变，生成一条带原因的新版本 */
export function appendRevision(
  appeal: Appeal,
  input: RevisionInput
): { appeal: Appeal; revision: AppealRevision } {
  if (appeal.status !== "APPROVED") {
    throw new Error("仅已通过的申诉可以补证");
  }
  const reason = input.reason.trim();
  const evidence = input.evidence.trim();
  const operator = input.operator.trim();
  if (!reason) throw new Error("补证必须填写原因");
  if (!evidence) throw new Error("补证必须填写补充说明 / 凭证编号");
  if (!operator) throw new Error("补证必须署名");

  const revision: AppealRevision = {
    version: appeal.revisions.length + 2, // 首次通过为 v1，第一次补证为 v2
    reason,
    evidence,
    operator,
    createdAt: input.at,
  };
  return {
    appeal: { ...appeal, revisions: [...appeal.revisions, revision] },
    revision,
  };
}
