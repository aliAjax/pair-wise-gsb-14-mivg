// 领域模型：价差申诉、退款额度、挂牌价版本
// 该文件只描述数据结构，不包含任何规则判断、存储读写或界面逻辑。

export const FUEL_TYPES = ["92号汽油", "95号汽油", "98号汽油", "0号柴油"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export interface Station {
  id: string;
  name: string;
}

/** 挂牌价版本：调价与补证都只追加新版本，历史版本不被覆盖 */
export interface PriceVersion {
  id: string;
  stationId: string;
  fuel: FuelType;
  /** 挂牌价（元/升） */
  listPrice: number;
  /** 生效时间（ISO） */
  effectiveAt: string;
  /** 调价或补证原因 */
  reason: string;
  operator: string;
  createdAt: string;
  /** 补证版本指向其替代的同刻旧版本；普通调价为空 */
  supersedesId?: string;
  /** 补证来源申诉单号 */
  sourceAppealId?: string;
  /** 申诉通过后被冻结 */
  frozen: boolean;
  frozenByAppealId?: string;
  frozenAt?: string;
}

/** 冻结在申诉单上的小票快照 */
export interface ReceiptSnapshot {
  stationId: string;
  fuel: FuelType;
  receiptAt: string;
  dealPrice: number;
}

/** 冻结在申诉单上的价格版本指针 */
export interface FrozenPriceRef {
  versionId: string;
  listPrice: number;
  snapshotAt: string;
}

/** 受理阶段的阻断原因（命中即不得受理） */
export type BlockCode =
  | "BEFORE_EFFECTIVE" // 小票早于该油品首次调价生效
  | "OVER_24H" // 小票距申诉超过二十四小时
  | "DUPLICATE"; // 重复申诉

/** 需要写依据并转入复核的情形 */
export type ReviewCode =
  | "OVER_QUOTA" // 站点当日累计退款超额度
  | "LIST_PRICE_MISSING"; // 同刻挂牌价缺失（未建档）

export type AppealStatus =
  | "PENDING_REVIEW" // 待复核
  | "APPROVED" // 已通过
  | "BLOCKED" // 不予受理
  | "REJECTED"; // 复核驳回

export interface Appeal {
  id: string;
  /** 业务单号，如 SS20260921-001 */
  code: string;
  stationId: string;
  fuel: FuelType;
  /** 小票时间（ISO） */
  receiptAt: string;
  /** 成交价（元/升） */
  dealPrice: number;
  applicant: string;
  contact?: string;

  /** 受理/复核时填写的依据说明 */
  basis?: string;
  status: AppealStatus;
  /** 不予受理时命中的阻断原因，持久保留 */
  blockReasons: BlockCode[];
  /** 转复核的情形，持久保留 */
  reviewFlags: ReviewCode[];

  /** 受理时刻识别到的同刻挂牌价，缺失为 null */
  intakeListPrice: number | null;
  /** 应退价差 = max(成交价 - 同刻挂牌价, 0)，补证后重算 */
  expectedRefund: number | null;
  /** 补证生成的新版本号 */
  supplementVersionId?: string;

  /** 通过后的实际退款额 */
  approvedRefund?: number;
  /** 退款计入站点额度的本地日期 yyyy-MM-dd（决策当日） */
  quotaDay?: string;

  /** 通过后冻结的小票与价格版本 */
  frozenReceipt?: ReceiptSnapshot;
  frozenPrice?: FrozenPriceRef;
  frozenAt?: string;

  /** 复核记录 */
  reviewBasis?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectReason?: string;

  createdAt: string;
}

/** 站点日退款额度（元/日） */
export interface StationQuota {
  stationId: string;
  dailyLimit: number;
}

export type EventKind =
  | "INTAKE"
  | "BLOCK"
  | "SUPPLEMENT"
  | "APPROVE"
  | "REJECT"
  | "PRICE"
  | "QUOTA";

export interface ArchiveEvent {
  id: string;
  at: string;
  kind: EventKind;
  message: string;
}

/** 本地档案的整体结构（localStorage 持久化） */
export interface Archive {
  schemaVersion: 1;
  stations: Station[];
  quotas: StationQuota[];
  priceVersions: PriceVersion[];
  appeals: Appeal[];
  events: ArchiveEvent[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
}
