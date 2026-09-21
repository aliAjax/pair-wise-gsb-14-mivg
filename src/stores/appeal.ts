// 状态层（Pinia）：编排领域规则与本地档案，组件只通过 store 操作数据。
// 不在这里写判断分支以外的规则；规则以 src/domain/rules.ts 的纯函数为准。

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { loadArchive, resetArchive, saveArchive } from "../archive/repository";
import { uid } from "../archive/id";
import {
  BLOCK_DESCRIPTIONS,
  REVIEW_DESCRIPTIONS,
  canAdjustPrice,
  canSupplement,
  evaluateIntake,
  planReviewApprove,
  quotaLimitFor,
  stationDayUsage,
} from "../domain/rules";
import type {
  ActionResult,
  Appeal,
  Archive,
  ArchiveEvent,
  EventKind,
  FuelType,
  PriceVersion,
} from "../domain/types";
import { localDay, priceAt, round2, toISO } from "../domain/time";

export interface IntakeFormInput {
  stationId: string;
  fuel: FuelType;
  /** datetime-local 字符串 */
  receiptInput: string;
  dealPrice: number;
  applicant: string;
  contact?: string;
}

export const useAppealStore = defineStore("appeal", () => {
  const archive = ref<Archive>(loadArchive());

  function persist() {
    saveArchive(archive.value);
  }

  function pushEvent(kind: EventKind, message: string) {
    const event: ArchiveEvent = { id: uid("evt"), at: toISO(new Date()), kind, message };
    archive.value.events = [event, ...archive.value.events].slice(0, 200);
  }

  function nextAppealCode(): string {
    const day = localDay(new Date()).replace(/-/g, "");
    const countToday = archive.value.appeals.filter((a) => a.code.startsWith(`SS${day}-`)).length;
    return `SS${day}-${String(countToday + 1).padStart(3, "0")}`;
  }

  function stationName(stationId: string): string {
    return archive.value.stations.find((s) => s.id === stationId)?.name ?? stationId;
  }

  function versionById(id: string | undefined | null): PriceVersion | undefined {
    if (!id) return undefined;
    return archive.value.priceVersions.find((v) => v.id === id);
  }

  /** 组件实时预判：返回受理评估结果（不产生副作用） */
  function previewIntake(form: IntakeFormInput) {
    const receiptISO = new Date(form.receiptInput).toISOString();
    return evaluateIntake(
      {
        stationId: form.stationId,
        fuel: form.fuel,
        receiptAt: receiptISO,
        dealPrice: Number(form.dealPrice),
      },
      {
        appeals: archive.value.appeals,
        versions: archive.value.priceVersions,
        quotas: archive.value.quotas,
        nowISO: toISO(new Date()),
      },
    );
  }

  /** 提交申诉：命中阻断则登记为「不予受理」（保留阻断原因）；否则受理为自动通过或待复核 */
  function submitAppeal(form: IntakeFormInput, basis: string): ActionResult {
    if (!form.stationId || !form.fuel || !form.receiptInput) {
      return { ok: false, message: "请完整选择站点、油品与小票时间" };
    }
    const dealPrice = Number(form.dealPrice);
    if (!Number.isFinite(dealPrice) || dealPrice < 0) {
      return { ok: false, message: "成交价需为不小于 0 的数字" };
    }
    const receiptISO = new Date(form.receiptInput).toISOString();
    if (Number.isNaN(new Date(receiptISO).getTime())) {
      return { ok: false, message: "小票时间格式不正确" };
    }
    if (new Date(receiptISO).getTime() > Date.now()) {
      return { ok: false, message: "小票时间不能晚于当前时间" };
    }
    if (!form.applicant.trim()) return { ok: false, message: "请填写申诉人" };

    const now = toISO(new Date());
    const verdict = evaluateIntake(
      {
        stationId: form.stationId,
        fuel: form.fuel,
        receiptAt: receiptISO,
        dealPrice,
      },
      {
        appeals: archive.value.appeals,
        versions: archive.value.priceVersions,
        quotas: archive.value.quotas,
        nowISO: now,
      },
    );

    const code = nextAppealCode();
    const base: Appeal = {
      id: uid("apl"),
      code,
      stationId: form.stationId,
      fuel: form.fuel,
      receiptAt: receiptISO,
      dealPrice: round2(dealPrice),
      applicant: form.applicant.trim(),
      contact: form.contact?.trim() || undefined,
      status: "PENDING_REVIEW",
      blockReasons: verdict.blockReasons,
      reviewFlags: verdict.reviewFlags,
      intakeListPrice: verdict.listPrice,
      expectedRefund: verdict.expectedRefund,
      basis: basis.trim() || undefined,
      createdAt: now,
    };

    if (verdict.blocked) {
      const blocked: Appeal = { ...base, status: "BLOCKED", basis: undefined };
      archive.value.appeals = [blocked, ...archive.value.appeals];
      const reasonText = verdict.blockReasons.map((c) => BLOCK_DESCRIPTIONS[c]).join("；");
      pushEvent("BLOCK", `${code} 不予受理：${reasonText}`);
      persist();
      return { ok: true, message: `已登记为不予受理：${reasonText}` };
    }

    if (verdict.needsReview) {
      if (!basis.trim()) {
        return { ok: false, message: "超额或挂牌价缺失须填写处理依据后再提交复核" };
      }
      archive.value.appeals = [base, ...archive.value.appeals];
      const flagText = verdict.reviewFlags.map((c) => REVIEW_DESCRIPTIONS[c]).join("；");
      pushEvent("INTAKE", `${code} 受理成功，转复核：${flagText}`);
      persist();
      return { ok: true, message: `申诉已受理，转复核：${flagText}` };
    }

    // 额度内且挂牌价可查：直接通过，冻结小票与当时价格版本
    const approved = freezeApproved(base, verdict.matchedVersionId, now, "额度内自动通过");
    archive.value.appeals = [approved, ...archive.value.appeals];
    pushEvent(
      "APPROVE",
      `${code} 自动通过，冻结小票与价格版本，退款 ${approved.approvedRefund} 元`,
    );
    persist();
    return { ok: true, message: `当日额度内直接通过，退款 ${approved.approvedRefund} 元（小票与价格版本已冻结）` };
  }

  /** 通过时冻结：固化小票快照与价格版本指针，价格版本本体打冻结标记 */
  function freezeApproved(appeal: Appeal, versionId: string | null, decidedAt: string, basis: string): Appeal {
    const version = versionId ? archive.value.priceVersions.find((v) => v.id === versionId) : undefined;
    const listPrice = version?.listPrice ?? appeal.intakeListPrice;
    const approvedRefund = listPrice === null || listPrice === undefined ? null : round2(Math.max(0, appeal.dealPrice - listPrice));

    if (version) {
      version.frozen = true;
      version.frozenByAppealId = appeal.id;
      version.frozenAt = decidedAt;
    }

    return {
      ...appeal,
      status: "APPROVED",
      basis: appeal.basis || basis,
      approvedRefund: approvedRefund ?? undefined,
      quotaDay: localDay(new Date(decidedAt)),
      frozenReceipt: {
        stationId: appeal.stationId,
        fuel: appeal.fuel,
        receiptAt: appeal.receiptAt,
        dealPrice: appeal.dealPrice,
      },
      frozenPrice: version
        ? { versionId: version.id, listPrice: version.listPrice, snapshotAt: decidedAt }
        : undefined,
      frozenAt: decidedAt,
    };
  }

  /** 复核驳回 */
  function rejectAppeal(appealId: string, reviewBasis: string, reviewer: string): ActionResult {
    const appeal = archive.value.appeals.find((a) => a.id === appealId);
    if (!appeal) return { ok: false, message: "申诉不存在" };
    if (appeal.status !== "PENDING_REVIEW") return { ok: false, message: "仅待复核单据可驳回" };
    if (!reviewBasis.trim()) return { ok: false, message: "驳回必须填写复核意见" };

    appeal.status = "REJECTED";
    appeal.reviewBasis = reviewBasis.trim();
    appeal.reviewedBy = reviewer.trim() || "复核员";
    appeal.reviewedAt = toISO(new Date());
    appeal.rejectReason = reviewBasis.trim();
    pushEvent("REJECT", `${appeal.code} 复核驳回：${reviewBasis.trim()}`);
    persist();
    return { ok: true, message: "已驳回，该单不再占用重复判定与额度" };
  }

  /** 复核通过：补证校验 + 额度二次校验通过后冻结 */
  function approveReview(appealId: string, reviewBasis: string, reviewer: string): ActionResult {
    const appeal = archive.value.appeals.find((a) => a.id === appealId);
    if (!appeal) return { ok: false, message: "申诉不存在" };
    if (!reviewBasis.trim()) return { ok: false, message: "复核通过必须填写复核意见与依据" };

    const now = toISO(new Date());
    const plan = planReviewApprove(
      appeal,
      archive.value.appeals,
      archive.value.priceVersions,
      archive.value.quotas,
      now,
    );
    if (!plan.ok) return { ok: false, message: plan.reason };

    const before = { ...appeal };
    Object.assign(
      appeal,
      freezeApproved(
        {
          ...before,
          expectedRefund: plan.plan.approvedRefund,
        },
        plan.plan.matchedVersionId,
        now,
        "复核通过",
      ),
    );
    appeal.reviewBasis = reviewBasis.trim();
    appeal.reviewedBy = reviewer.trim() || "复核员";
    appeal.reviewedAt = now;
    pushEvent(
      "APPROVE",
      `${appeal.code} 复核通过，冻结小票与价格版本，退款 ${plan.plan.approvedRefund} 元`,
    );
    persist();
    return { ok: true, message: `复核通过，退款 ${plan.plan.approvedRefund} 元（已冻结）` };
  }

  /** 补证：在小票时刻追加一个带原因的新版本，指向原本同刻匹配（或缺失）的版本链 */
  function supplement(
    appealId: string,
    input: { listPrice: number; reason: string; operator: string },
  ): ActionResult {
    const appeal = archive.value.appeals.find((a) => a.id === appealId);
    if (!appeal) return { ok: false, message: "申诉不存在" };
    if (!canSupplement(appeal)) {
      return { ok: false, message: "仅待复核且因挂牌价缺失、尚未补证的单据可补证" };
    }
    if (!Number.isFinite(input.listPrice) || input.listPrice < 0) {
      return { ok: false, message: "补证挂牌价需为不小于 0 的数字" };
    }
    if (!input.reason.trim()) return { ok: false, message: "补证必须填写原因" };

    const now = toISO(new Date());
    // 同刻若已有生效版本（被补证替代），新版本指向它
    const oldMatch = priceAt(
      archive.value.priceVersions,
      appeal.stationId,
      appeal.fuel,
      appeal.receiptAt,
    );

    const version: PriceVersion = {
      id: uid("ver"),
      stationId: appeal.stationId,
      fuel: appeal.fuel,
      listPrice: round2(input.listPrice),
      effectiveAt: appeal.receiptAt,
      reason: `补证：${input.reason.trim()}`,
      operator: input.operator.trim() || "复核员",
      createdAt: now,
      supersedesId: oldMatch ? oldMatch.version.id : undefined,
      sourceAppealId: appeal.id,
      frozen: false,
    };
    archive.value.priceVersions = [...archive.value.priceVersions, version];
    appeal.supplementVersionId = version.id;
    appeal.expectedRefund = round2(Math.max(0, appeal.dealPrice - version.listPrice));
    pushEvent(
      "SUPPLEMENT",
      `${appeal.code} 补证生成新版本 ${version.id}：${version.fuel} ${version.listPrice} 元/升，原因「${input.reason.trim()}」`,
    );
    persist();
    return { ok: true, message: "补证版本已生成，应退价差已重算，可执行复核通过" };
  }

  /** 普通调价：仅追加新版本，禁止覆盖；生效时间必须晚于当前最新 */
  function addPriceVersion(input: {
    stationId: string;
    fuel: FuelType;
    effectiveInput: string;
    listPrice: number;
    reason: string;
    operator: string;
  }): ActionResult {
    if (!input.stationId || !input.fuel) return { ok: false, message: "请选择站点与油品" };
    const effectiveISO = new Date(input.effectiveInput).toISOString();
    if (!input.effectiveInput || Number.isNaN(new Date(effectiveISO).getTime())) {
      return { ok: false, message: "请选择生效时间" };
    }
    if (!Number.isFinite(input.listPrice) || input.listPrice < 0) {
      return { ok: false, message: "挂牌价需为不小于 0 的数字" };
    }
    if (!input.reason.trim()) return { ok: false, message: "调价必须填写原因" };

    const check = canAdjustPrice(
      archive.value.priceVersions,
      input.stationId,
      input.fuel,
      effectiveISO,
    );
    if (!check.ok) return { ok: false, message: check.reason ?? "调价不合法" };

    const version: PriceVersion = {
      id: uid("ver"),
      stationId: input.stationId,
      fuel: input.fuel,
      listPrice: round2(input.listPrice),
      effectiveAt: effectiveISO,
      reason: input.reason.trim(),
      operator: input.operator.trim() || "操作员",
      createdAt: toISO(new Date()),
      frozen: false,
    };
    archive.value.priceVersions = [...archive.value.priceVersions, version];
    pushEvent(
      "PRICE",
      `${stationName(input.stationId)} ${input.fuel} 新版本 ${version.id} 生效，挂牌价 ${version.listPrice} 元/升`,
    );
    persist();
    return { ok: true, message: "调价版本已追加，历史版本保留" };
  }

  function updateQuota(stationId: string, dailyLimit: number): ActionResult {
    if (!Number.isFinite(dailyLimit) || dailyLimit < 0) {
      return { ok: false, message: "日额度需为不小于 0 的数字" };
    }
    const q = archive.value.quotas.find((item) => item.stationId === stationId);
    if (!q) return { ok: false, message: "站点额度不存在" };
    q.dailyLimit = round2(dailyLimit);
    pushEvent("QUOTA", `${stationName(stationId)} 日退款额度调整为 ${q.dailyLimit} 元`);
    persist();
    return { ok: true, message: "额度已更新" };
  }

  function resetDemo(): ActionResult {
    archive.value = resetArchive();
    return { ok: true, message: "已恢复演示档案" };
  }

  // ---------- 查询视图 ----------
  const stations = computed(() => archive.value.stations);
  const appeals = computed(() =>
    [...archive.value.appeals].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
  const priceVersions = computed(() =>
    [...archive.value.priceVersions].sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt)),
  );
  const events = computed(() => archive.value.events);

  const today = computed(() => localDay(new Date()));

  const quotasView = computed(() =>
    archive.value.stations.map((station) => {
      const limit = quotaLimitFor(archive.value.quotas, station.id);
      const used = stationDayUsage(archive.value.appeals, station.id, today.value);
      return {
        station,
        limit: limit ?? 0,
        used,
        remaining: limit === null ? null : round2(limit - used),
        over: limit !== null && used > limit + 0.0001,
      };
    }),
  );

  const metric = computed(() => {
    const list = archive.value.appeals;
    return {
      total: list.length,
      pending: list.filter((a) => a.status === "PENDING_REVIEW").length,
      approved: list.filter((a) => a.status === "APPROVED").length,
      blocked: list.filter((a) => a.status === "BLOCKED").length,
      refundToday: round2(
        list
          .filter((a) => a.status === "APPROVED" && a.quotaDay === today.value)
          .reduce((sum, a) => sum + (a.approvedRefund ?? 0), 0),
      ),
      frozenVersions: archive.value.priceVersions.filter((v) => v.frozen).length,
    };
  });

  return {
    // state
    archive,
    // actions
    submitAppeal,
    previewIntake,
    rejectAppeal,
    approveReview,
    supplement,
    addPriceVersion,
    updateQuota,
    resetDemo,
    stationName,
    versionById,
    // views
    stations,
    appeals,
    priceVersions,
    events,
    quotasView,
    metric,
    today,
  };
});
