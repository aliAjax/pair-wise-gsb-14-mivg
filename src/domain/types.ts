// 领域模型：价差申诉与退款额度台
// 规则层与档案层共用的类型定义，不含任何 IO / 框架依赖。

export const FUELS = ["92号汽油", "95号汽油", "98号汽油", "0号柴油"] as const;
export type Fuel = (typeof FUELS)[number];

/** 站点；quota 为该站点每个自然日的累计退款额度（元） */
export interface Station {
  id: string;
  name: string;
  quota: number;
}

/**
 * 挂牌价版本（append-only 台账）。
 * 同一油品的版本按 effectiveFrom 生效；小票时刻落在哪个版本区间，
 * 就以哪个版本为"当时挂牌价"。
 */
export interface PriceVersion {
  id: string;
  fuel: Fuel;
  /** 本次挂牌价（元/升） */
  listPrice: number;
  /** ISO 时间：自该时刻起生效 */
  effectiveFrom: string;
  operator: string;
  reason: string;
  createdAt: string;
}

/** 受理阻断原因（硬阻断：本次提交不进入流程） */
export type BlockCode =
  | "EARLY_BEFORE_PRICE" // 小票早于该油品最早挂牌价版本生效时间
  | "RECEIPT_OVERDUE" // 小票时间距提交超过 24 小时
  | "DUPLICATE"; // 同站点 + 同油品 + 同小票时间已被受理过

/** 复核原因（软阻断：进入待复核，须写依据） */
export type ReviewCode =
  | "OVER_QUOTA" // 叠加本次退款后超过站点当日退款额度
  | "LIST_PRICE_MISSING"; // 小票时刻匹配不到挂牌价版本

export type BlockReason = {
  code: BlockCode;
  detail: string;
};

export type ReviewReason = {
  code: ReviewCode;
  detail: string;
};

export type AppealStatus =
  | "BLOCKED" // 受理被阻断（不进入额度统计）
  | "PENDING_REVIEW" // 待复核
  | "APPROVED" // 已通过（小票与价格版本已冻结）
  | "REJECTED"; // 复核驳回

/** 冻结的当时价格版本快照；通过后不可变 */
export interface FrozenPrice {
  versionId: string | null;
  fuel: Fuel;
  listPrice: number | null;
  effectiveFrom: string | null;
  frozenAt: string;
}

/** 冻结的小票信息 */
export interface FrozenReceipt {
  stationId: string;
  fuel: Fuel;
  receiptAt: string;
  dealPrice: number;
  /** 申诉人填写的"同刻挂牌价"（仅留痕，可能与系统版本不一致） */
  claimedListPrice: number;
  volume: number;
  frozenAt: string;
}

/** 补证记录：通过后补证只追加新版本，不改原冻结数据 */
export interface AppealRevision {
  version: number;
  reason: string;
  evidence: string;
  operator: string;
  createdAt: string;
}

export interface Appeal {
  id: string;
  code: string;
  stationId: string;
  fuel: Fuel;
  receiptAt: string;
  dealPrice: number;
  claimedListPrice: number;
  volume: number;

  status: AppealStatus;
  blockReasons: BlockReason[];
  reviewReasons: ReviewReason[];

  /** 受理时预估的退款（元）；挂牌价缺失时为 null，复核确认后补算 */
  estimatedRefund: number | null;
  /** 最终退款（元），通过时写入 */
  refund: number | null;

  /** 复核依据 / 驳回理由 */
  basis: string;
  reviewer: string;
  reviewedAt: string | null;
  /** 挂牌价缺失时，复核确认的挂牌价 */
  confirmedListPrice: number | null;

  /** 通过后冻结的小票与当时价格版本 */
  frozenReceipt: FrozenReceipt | null;
  frozenPrice: FrozenPrice | null;

  revisions: AppealRevision[];
  createdAt: string;
  /** 进入 APPROVED 的时刻，额度按该时刻所在自然日归集 */
  approvedAt: string | null;
}

/** 申诉录入输入 */
export interface AppealInput {
  stationId: string;
  fuel: Fuel;
  receiptAt: string;
  dealPrice: number;
  claimedListPrice: number;
  volume: number;
}

/** 完整本地档案 */
export interface ArchiveData {
  stations: Station[];
  priceVersions: PriceVersion[];
  appeals: Appeal[];
  /** 单调递增的申诉编号 */
  appealSeq: number;
}
