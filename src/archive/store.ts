// 本地档案层：localStorage 读写 + 演示种子。
// 对上层只暴露 load / save / reset，规则层不感知存储方式。

import type {
  Appeal,
  ArchiveData,
  Fuel,
  PriceVersion,
  Station,
} from "../domain/types";
import { DAY_MS, HOUR_MS, round2 } from "../domain/time";
import { calcRefund, versionsOfFuel } from "../domain/rules";

const STORAGE_KEY = "dfwlfront-9-price-appeal";
const ARCHIVE_VERSION = 1;

export const STATIONS: Station[] = [
  { id: "S01", name: "城东第一加油站", quota: 800 },
  { id: "S02", name: "滨江大道加油站", quota: 500 },
  { id: "S03", name: "开发区加油站", quota: 300 },
];

function iso(offsetMs: number, base: number): string {
  return new Date(base + offsetMs).toISOString();
}

/**
 * 构造演示种子。时间以"此刻"为锚点，保证覆盖：
 * 正常直通过、超额待复核、挂牌价缺失待复核、
 * 超 24 小时阻断、早于调价生效阻断、重复阻断、通过后补证。
 */
export function buildSeed(now: Date = new Date()): ArchiveData {
  const t = now.getTime();

  const priceVersions: PriceVersion[] = [
    {
      id: "pv-92-1",
      fuel: "92号汽油",
      listPrice: 7.62,
      effectiveFrom: iso(-20 * DAY_MS, t),
      operator: "站长",
      reason: "月度调价",
      createdAt: iso(-21 * DAY_MS, t),
    },
    {
      id: "pv-92-2",
      fuel: "92号汽油",
      listPrice: 7.54,
      effectiveFrom: iso(-3 * DAY_MS, t),
      operator: "值班经理",
      reason: "跟随主营降价",
      createdAt: iso(-4 * DAY_MS, t),
    },
    {
      id: "pv-95-1",
      fuel: "95号汽油",
      listPrice: 8.11,
      effectiveFrom: iso(-12 * DAY_MS, t),
      operator: "站长",
      reason: "月度调价",
      createdAt: iso(-13 * DAY_MS, t),
    },
    {
      id: "pv-0-1",
      fuel: "0号柴油",
      listPrice: 7.18,
      effectiveFrom: iso(-8 * DAY_MS, t),
      operator: "值班经理",
      reason: "常规挂牌",
      createdAt: iso(-9 * DAY_MS, t),
    },
    // 98号汽油故意不建任何版本：用于演示"挂牌价缺失须复核"
  ];

  const v92 = effective(priceVersions, "92号汽油", iso(-5 * HOUR_MS, t));
  const v95 = effective(priceVersions, "95号汽油", iso(-30 * HOUR_MS, t));

  const appeals: Appeal[] = [
    // 1) 当日已通过的退款，占用 S01 额度（60L × (7.54-7.30) = 14.40）
    approvedSeed(
      "AP-26090001",
      "S01",
      "92号汽油",
      iso(-5 * HOUR_MS, t),
      7.3,
      7.54,
      60,
      v92!,
      iso(-4 * HOUR_MS, t),
      "挂牌价差，额度内自动通过"
    ),
    // 2) 提交即超额 → 待复核（S01 当日已用 14.40，额度 800；本次预估 816，合计 830.40）
    {
      id: "seed-2",
      code: "AP-26090002",
      stationId: "S01",
      fuel: "92号汽油",
      receiptAt: iso(-2 * HOUR_MS, t),
      dealPrice: 6.86,
      claimedListPrice: 7.54,
      volume: 1200,
      status: "PENDING_REVIEW",
      blockReasons: [],
      reviewReasons: [
        {
          code: "OVER_QUOTA",
          detail:
            "当日已通过退款 14.40 元，叠加本次 816.00 元后超过站点当日额度 800 元，须填写依据并复核",
        },
      ],
      estimatedRefund: calcRefund(7.54, 6.86, 1200),
      refund: null,
      basis: "",
      reviewer: "",
      reviewedAt: null,
      confirmedListPrice: null,
      frozenReceipt: null,
      frozenPrice: null,
      revisions: [],
      createdAt: iso(-90 * 60 * 1000, t),
      approvedAt: null,
    },
    // 3) 98号汽油无价格版本 → 挂牌价缺失待复核
    {
      id: "seed-3",
      code: "AP-26090003",
      stationId: "S02",
      fuel: "98号汽油",
      receiptAt: iso(-3 * HOUR_MS, t),
      dealPrice: 8.52,
      claimedListPrice: 8.89,
      volume: 40,
      status: "PENDING_REVIEW",
      blockReasons: [],
      reviewReasons: [
        {
          code: "LIST_PRICE_MISSING",
          detail:
            "小票时刻缺少可对应的挂牌价版本，须填写依据并由复核人确认挂牌价",
        },
      ],
      estimatedRefund: null,
      refund: null,
      basis: "",
      reviewer: "",
      reviewedAt: null,
      confirmedListPrice: null,
      frozenReceipt: null,
      frozenPrice: null,
      revisions: [],
      createdAt: iso(-2 * HOUR_MS, t),
      approvedAt: null,
    },
    // 4) 小票超过 24 小时 → 阻断
    {
      ...emptySeed(
        "seed-4",
        "AP-26090004",
        "S01",
        "95号汽油",
        iso(-26 * HOUR_MS, t),
        7.85,
        8.11,
        50,
        iso(-30 * 60 * 1000, t)
      ),
      blockReasons: [
        {
          code: "RECEIPT_OVERDUE",
          detail: "小票时间距提交已超过 24 小时，不得受理",
        },
      ],
    },
    // 5) 小票早于 95 号最早调价生效 → 阻断
    {
      ...emptySeed(
        "seed-5",
        "AP-26090005",
        "S02",
        "95号汽油",
        iso(-20 * DAY_MS - HOUR_MS, t),
        7.9,
        8.11,
        30,
        iso(-20 * 60 * 1000, t)
      ),
      blockReasons: [
        {
          code: "EARLY_BEFORE_PRICE",
          detail: "小票时间早于该油品挂牌价最早生效时间，不得受理",
        },
        {
          code: "RECEIPT_OVERDUE",
          detail: "小票时间距提交已超过 24 小时，不得受理",
        },
      ],
    },
  ];

  // 6) 与 1) 同站点 / 同油品 / 同小票时间 → 重复阻断
  appeals.push({
    ...emptySeed(
      "seed-6",
      "AP-26090006",
      "S01",
      "92号汽油",
      iso(-5 * HOUR_MS, t),
      7.31,
      7.54,
      40,
      iso(-20 * 60 * 1000, t)
    ),
    blockReasons: [
      {
        code: "DUPLICATE",
        detail: "同站点 / 同油品 / 同小票时间的申诉已受理（编号 AP-26090001），不得重复受理",
      },
    ],
  });

  // 7) 已通过且补过一次证（补证生成带原因的新版本）
  const supplemented = approvedSeed(
    "AP-26090007",
    "S02",
    "95号汽油",
    iso(-2 * DAY_MS - 4 * HOUR_MS, t),
    7.95,
    8.11,
    45,
    v95!,
    iso(-2 * DAY_MS - 3 * HOUR_MS, t),
    "车主提供差价小票，额度内自动通过"
  );
  supplemented.revisions = [
    {
      version: 2,
      reason: "车主补传带时间戳的支付凭证",
      evidence: "凭证 IMG-202609-7782",
      operator: "复核员李娜",
      createdAt: iso(-2 * DAY_MS, t),
    },
  ];
  appeals.unshift(supplemented);

  return {
    stations: STATIONS,
    priceVersions,
    appeals,
    appealSeq: appeals.length,
  };
}

function effective(
  versions: PriceVersion[],
  fuel: Fuel,
  at: string
): PriceVersion | null {
  const list = versionsOfFuel(versions, fuel);
  return list.filter((v) => +new Date(v.effectiveFrom) <= +new Date(at)).pop() ?? null;
}

function emptySeed(
  id: string,
  code: string,
  stationId: string,
  fuel: Fuel,
  receiptAt: string,
  dealPrice: number,
  claimedListPrice: number,
  volume: number,
  createdAt: string
): Appeal {
  return {
    id,
    code,
    stationId,
    fuel,
    receiptAt,
    dealPrice,
    claimedListPrice,
    volume,
    status: "BLOCKED",
    blockReasons: [],
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
    createdAt,
    approvedAt: null,
  };
}

function approvedSeed(
  code: string,
  stationId: string,
  fuel: Fuel,
  receiptAt: string,
  dealPrice: number,
  claimedListPrice: number,
  volume: number,
  version: PriceVersion,
  approvedAt: string,
  basis: string
): Appeal {
  return {
    id: `seed-${code}`,
    code,
    stationId,
    fuel,
    receiptAt,
    dealPrice,
    claimedListPrice,
    volume,
    status: "APPROVED",
    blockReasons: [],
    reviewReasons: [],
    estimatedRefund: calcRefund(version.listPrice, dealPrice, volume),
    refund: round2(calcRefund(version.listPrice, dealPrice, volume)),
    basis,
    reviewer: "系统",
    reviewedAt: approvedAt,
    confirmedListPrice: null,
    frozenReceipt: {
      stationId,
      fuel,
      receiptAt,
      dealPrice,
      claimedListPrice,
      volume,
      frozenAt: approvedAt,
    },
    frozenPrice: {
      versionId: version.id,
      fuel,
      listPrice: version.listPrice,
      effectiveFrom: version.effectiveFrom,
      frozenAt: approvedAt,
    },
    revisions: [],
    createdAt: approvedAt,
    approvedAt,
  };
}

function isValidArchive(value: unknown): value is ArchiveData {
  if (!value || typeof value !== "object") return false;
  const v = value as ArchiveData;
  return (
    Array.isArray(v.stations) &&
    Array.isArray(v.priceVersions) &&
    Array.isArray(v.appeals) &&
    typeof v.appealSeq === "number"
  );
}

export function loadArchive(): ArchiveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { version?: number; data?: ArchiveData };
      if (parsed.version === ARCHIVE_VERSION && isValidArchive(parsed.data)) {
        return parsed.data;
      }
    }
  } catch {
    // 档案损坏时回落到种子数据
  }
  const seed = buildSeed();
  saveArchive(seed);
  return seed;
}

export function saveArchive(data: ArchiveData): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: ARCHIVE_VERSION, data })
  );
}

export function resetArchive(): ArchiveData {
  localStorage.removeItem(STORAGE_KEY);
  return loadArchive();
}
