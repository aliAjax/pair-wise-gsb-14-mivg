// 本地档案：首次打开（localStorage 无记录）时的演示数据
// 种子数据必须自身满足全部领域规则，由仓库在加载时一次性落库。

import type {
  Appeal,
  Archive,
  ArchiveEvent,
  PriceVersion,
  Station,
  StationQuota,
} from "./types";
import { isoAgo, localDay, round2 } from "./time";

export const STORAGE_KEY = "dfwlfront-9-appeal-archive";

export function buildSeedArchive(): Archive {
  const now = new Date();

  const stations: Station[] = [
    { id: "SH001", name: "上海一站" },
    { id: "BJ002", name: "北京二站" },
    { id: "GZ003", name: "广州三站" },
  ];

  const quotas: StationQuota[] = [
    { stationId: "SH001", dailyLimit: 0.4 },
    { stationId: "BJ002", dailyLimit: 1.5 },
    { stationId: "GZ003", dailyLimit: 1 },
  ];

  const versions: PriceVersion[] = [
    {
      id: "ver-sh92-a",
      stationId: "SH001",
      fuel: "92号汽油",
      listPrice: 7.62,
      effectiveAt: isoAgo(30, 0, 0, now),
      reason: "月度正常调价",
      operator: "站长",
      createdAt: isoAgo(30, 1, 0, now),
      frozen: true,
      frozenByAppealId: "apl-seed-1",
      frozenAt: isoAgo(0, 6, 0, now),
    },
    {
      id: "ver-sh95-a",
      stationId: "SH001",
      fuel: "95号汽油",
      listPrice: 8.14,
      effectiveAt: isoAgo(15, 0, 0, now),
      reason: "月度正常调价",
      operator: "站长",
      createdAt: isoAgo(15, 1, 0, now),
      frozen: false,
    },
    {
      id: "ver-bj92-a",
      stationId: "BJ002",
      fuel: "92号汽油",
      listPrice: 7.58,
      effectiveAt: isoAgo(0, 6, 0, now),
      reason: "今日新挂价格（首次调价）",
      operator: "值班经理",
      createdAt: isoAgo(0, 7, 0, now),
      frozen: false,
    },
    {
      id: "ver-bj98-a",
      stationId: "BJ002",
      fuel: "98号汽油",
      listPrice: 9.36,
      effectiveAt: isoAgo(20, 0, 0, now),
      reason: "区域调价",
      operator: "值班经理",
      createdAt: isoAgo(20, 2, 0, now),
      frozen: false,
    },
    {
      id: "ver-gz92-a",
      stationId: "GZ003",
      fuel: "92号汽油",
      listPrice: 7.69,
      effectiveAt: isoAgo(10, 0, 0, now),
      reason: "月度正常调价",
      operator: "站长",
      createdAt: isoAgo(10, 1, 0, now),
      frozen: false,
    },
    {
      id: "ver-gz95-a",
      stationId: "GZ003",
      fuel: "95号汽油",
      listPrice: 8.21,
      effectiveAt: isoAgo(10, 0, 0, now),
      reason: "月度正常调价",
      operator: "站长",
      createdAt: isoAgo(10, 1, 0, now),
      frozen: false,
    },
    // 广州三站 0号柴油刻意不建档，用于演示「同刻挂牌价缺失 → 补证 → 复核」
  ];

  const approvedAt = isoAgo(0, 6, 0, now);
  const approvedReceipt = isoAgo(0, 20, 0, now);

  const appeals: Appeal[] = [
    {
      id: "apl-seed-1",
      code: "SS-SEED-001",
      stationId: "SH001",
      fuel: "92号汽油",
      receiptAt: approvedReceipt,
      dealPrice: 7.95,
      applicant: "车队李师傅",
      contact: "138****0001",
      basis: "当日额度内，自动通过",
      status: "APPROVED",
      blockReasons: [],
      reviewFlags: [],
      intakeListPrice: 7.62,
      expectedRefund: 0.33,
      approvedRefund: 0.33,
      quotaDay: localDay(new Date(approvedAt)),
      frozenReceipt: {
        stationId: "SH001",
        fuel: "92号汽油",
        receiptAt: approvedReceipt,
        dealPrice: 7.95,
      },
      frozenPrice: {
        versionId: "ver-sh92-a",
        listPrice: 7.62,
        snapshotAt: approvedAt,
      },
      frozenAt: approvedAt,
      createdAt: isoAgo(0, 6, 5, now),
    },
    {
      id: "apl-seed-2",
      code: "SS-SEED-002",
      stationId: "SH001",
      fuel: "95号汽油",
      receiptAt: isoAgo(0, 3, 0, now),
      dealPrice: 8.51,
      applicant: "车队李师傅",
      contact: "138****0001",
      basis: "上海一站当日额度 0.40 元，已退 0.33 元，本单预计 0.37 元将超限，转复核",
      status: "PENDING_REVIEW",
      blockReasons: [],
      reviewFlags: ["OVER_QUOTA"],
      intakeListPrice: 8.14,
      expectedRefund: round2(8.51 - 8.14),
      createdAt: isoAgo(0, 2, 30, now),
    },
    {
      id: "apl-seed-3",
      code: "SS-SEED-003",
      stationId: "GZ003",
      fuel: "0号柴油",
      receiptAt: isoAgo(0, 4, 0, now),
      dealPrice: 7.55,
      applicant: "物流王师傅",
      contact: "139****0002",
      basis: "广州三站 0号柴油未在小票时刻建档，挂牌价缺失，需补证后复核",
      status: "PENDING_REVIEW",
      blockReasons: [],
      reviewFlags: ["LIST_PRICE_MISSING"],
      intakeListPrice: null,
      expectedRefund: null,
      createdAt: isoAgo(0, 3, 30, now),
    },
    {
      id: "apl-seed-4",
      code: "SS-SEED-004",
      stationId: "BJ002",
      fuel: "98号汽油",
      receiptAt: isoAgo(2, 0, 0, now),
      dealPrice: 9.6,
      applicant: "散客",
      basis: "",
      status: "BLOCKED",
      blockReasons: ["OVER_24H"],
      reviewFlags: [],
      intakeListPrice: 9.36,
      expectedRefund: round2(9.6 - 9.36),
      createdAt: isoAgo(0, 2, 0, now),
    },
    {
      id: "apl-seed-5",
      code: "SS-SEED-005",
      stationId: "BJ002",
      fuel: "92号汽油",
      // 早于北京二站 92号汽油今日首次调价（6 小时前生效），但小票距今仅 10 小时
      receiptAt: isoAgo(0, 10, 0, now),
      dealPrice: 7.9,
      applicant: "散客",
      basis: "",
      status: "BLOCKED",
      blockReasons: ["BEFORE_EFFECTIVE"],
      reviewFlags: [],
      intakeListPrice: null,
      expectedRefund: null,
      createdAt: isoAgo(0, 4, 30, now),
    },
  ];

  const events: ArchiveEvent[] = [
    {
      id: "evt-seed-1",
      at: approvedAt,
      kind: "APPROVE",
      message: "SS-SEED-001 上海一站 92号汽油 自动通过，冻结小票与价格版本，退款 0.33 元",
    },
    {
      id: "evt-seed-2",
      at: isoAgo(0, 2, 30, now),
      kind: "INTAKE",
      message: "SS-SEED-002 超日额度，转复核",
    },
    {
      id: "evt-seed-3",
      at: isoAgo(0, 3, 30, now),
      kind: "INTAKE",
      message: "SS-SEED-003 同刻挂牌价缺失，转复核待补证",
    },
    {
      id: "evt-seed-4",
      at: isoAgo(0, 2, 0, now),
      kind: "BLOCK",
      message: "SS-SEED-004 不予受理：小票距申诉超过二十四小时",
    },
    {
      id: "evt-seed-5",
      at: isoAgo(0, 4, 30, now),
      kind: "BLOCK",
      message: "SS-SEED-005 不予受理：小票早于首次调价生效",
    },
  ];

  return { schemaVersion: 1, stations, quotas, priceVersions: versions, appeals, events };
}
