import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  Appeal,
  AppealInput,
  ArchiveData,
  Fuel,
  PriceVersion,
} from "../domain/types";
import {
  appendRevision,
  applyReview,
  buildIntakeAppeal,
  findDuplicate,
  resolvePrice,
  stationDayUsed,
  stationQuota,
  versionConflict,
  type ReviewDecision,
} from "../domain/rules";
import { nowIso, todayKey } from "../domain/time";
import { loadArchive, resetArchive, saveArchive } from "../archive/store";

export type IntakeForm = {
  stationId: string;
  fuel: Fuel;
  receiptAtInput: string; // datetime-local
  dealPrice: number | null;
  claimedListPrice: number | null;
  volume: number | null;
};

export type IntakePreview = {
  blockReasons: Appeal["blockReasons"];
  reviewReasons: Appeal["reviewReasons"];
  matchedVersion: PriceVersion | null;
  estimatedRefund: number | null;
  usedToday: number;
  quota: number;
  valid: boolean;
};

export const useAppealStore = defineStore("priceAppeal", () => {
  const data = ref<ArchiveData>(loadArchive());

  function persist() {
    saveArchive(data.value);
  }

  const stations = computed(() => data.value.stations);
  const priceVersions = computed(() => data.value.priceVersions);
  const appeals = computed(() =>
    [...data.value.appeals].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
    )
  );

  function nextCode(): string {
    data.value.appealSeq += 1;
    return `AP-2609${String(data.value.appealSeq).padStart(4, "0")}`;
  }

  // ---------- 受理预检（只读，供表单实时提示） ----------

  function previewIntake(form: IntakeForm): IntakePreview | null {
    if (
      !form.stationId ||
      !form.fuel ||
      !form.receiptAtInput ||
      form.dealPrice === null ||
      form.claimedListPrice === null ||
      form.volume === null ||
      Number.isNaN(+new Date(form.receiptAtInput))
    ) {
      return null;
    }
    const input: AppealInput = {
      stationId: form.stationId,
      fuel: form.fuel,
      receiptAt: new Date(form.receiptAtInput).toISOString(),
      dealPrice: form.dealPrice,
      claimedListPrice: form.claimedListPrice,
      volume: form.volume,
    };
    const submittedAt = nowIso();
    const probe = buildIntakeAppeal(
      input,
      {
        priceVersions: data.value.priceVersions,
        appeals: data.value.appeals,
        stations: data.value.stations,
      },
      { id: "preview", code: "PREVIEW", submittedAt }
    );
    const resolution = resolvePrice(
      data.value.priceVersions,
      input.fuel,
      input.receiptAt
    );
    const used = stationDayUsed(data.value.appeals, input.stationId, todayKey());
    return {
      blockReasons: probe.blockReasons,
      reviewReasons: probe.reviewReasons,
      matchedVersion: resolution.kind === "OK" ? resolution.version : null,
      estimatedRefund: probe.estimatedRefund,
      usedToday: used,
      quota: stationQuota(data.value.stations, input.stationId),
      valid: probe.blockReasons.length === 0,
    };
  }

  // ---------- 受理提交 ----------

  function submitIntake(form: IntakeForm): Appeal {
    if (
      !form.stationId ||
      !form.fuel ||
      !form.receiptAtInput ||
      form.dealPrice === null ||
      form.claimedListPrice === null ||
      form.volume === null
    ) {
      throw new Error("请完整填写申诉信息");
    }
    if (form.dealPrice < 0 || form.claimedListPrice < 0 || form.volume <= 0) {
      throw new Error("成交价 / 挂牌价不能为负，加油升数须大于 0");
    }
    const input: AppealInput = {
      stationId: form.stationId,
      fuel: form.fuel,
      receiptAt: new Date(form.receiptAtInput).toISOString(),
      dealPrice: form.dealPrice,
      claimedListPrice: form.claimedListPrice,
      volume: form.volume,
    };
    const appeal = buildIntakeAppeal(
      input,
      data.value,
      {
        id: crypto.randomUUID(),
        code: nextCode(),
        submittedAt: nowIso(),
      }
    );
    data.value.appeals.push(appeal);
    persist();
    return appeal;
  }

  // ---------- 复核 ----------

  function review(id: string, decision: ReviewDecision) {
    const idx = data.value.appeals.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("申诉不存在");
    data.value.appeals[idx] = applyReview(
      data.value.appeals[idx],
      data.value.priceVersions,
      decision,
      nowIso()
    );
    persist();
  }

  // ---------- 通过后补证 ----------

  function supplement(
    id: string,
    payload: { reason: string; evidence: string; operator: string }
  ) {
    const idx = data.value.appeals.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("申诉不存在");
    const { appeal } = appendRevision(data.value.appeals[idx], {
      ...payload,
      at: nowIso(),
    });
    data.value.appeals[idx] = appeal;
    persist();
  }

  // ---------- 挂牌价版本台账（只追加；被引用版本不可删） ----------

  function addPriceVersion(payload: {
    fuel: Fuel;
    listPrice: number;
    effectiveFromInput: string;
    operator: string;
    reason: string;
  }): PriceVersion {
    if (!(payload.listPrice > 0)) throw new Error("挂牌价须大于 0");
    if (!payload.effectiveFromInput) throw new Error("请选择生效时间");
    const effectiveFrom = new Date(payload.effectiveFromInput).toISOString();
    const conflict = versionConflict(
      data.value.priceVersions,
      payload.fuel,
      effectiveFrom
    );
    if (conflict) throw new Error(conflict);
    const version: PriceVersion = {
      id: crypto.randomUUID(),
      fuel: payload.fuel,
      listPrice: payload.listPrice,
      effectiveFrom,
      operator: payload.operator.trim() || "值班员",
      reason: payload.reason.trim() || "常规调价",
      createdAt: nowIso(),
    };
    data.value.priceVersions.push(version);
    persist();
    return version;
  }

  function canRemoveVersion(versionId: string): boolean {
    return !data.value.appeals.some(
      (a) => a.frozenPrice?.versionId === versionId
    );
  }

  function removePriceVersion(versionId: string) {
    if (
      data.value.appeals.some((a) => a.frozenPrice?.versionId === versionId)
    ) {
      throw new Error("该价格版本已被通过的申诉冻结引用，不可删除");
    }
    data.value.priceVersions = data.value.priceVersions.filter(
      (v) => v.id !== versionId
    );
    persist();
  }

  // ---------- 阻断 / 驳回件清理（冻结件不可删） ----------

  function removeAppeal(id: string) {
    const target = data.value.appeals.find((a) => a.id === id);
    if (!target) return;
    if (target.status === "APPROVED") {
      throw new Error("已通过的申诉小票与价格版本已冻结，不可删除");
    }
    data.value.appeals = data.value.appeals.filter((a) => a.id !== id);
    persist();
  }

  function resetDemo() {
    data.value = resetArchive();
  }

  // ---------- 查询辅助 ----------

  function stationName(id: string): string {
    return data.value.stations.find((s) => s.id === id)?.name ?? id;
  }

  function usageToday(stationId: string) {
    const used = stationDayUsed(data.value.appeals, stationId, todayKey());
    const quota = stationQuota(data.value.stations, stationId);
    return { used, quota, remaining: Math.round((quota - used) * 100) / 100 };
  }

  function duplicateOf(form: IntakeForm): Appeal | null {
    if (!form.stationId || !form.fuel || !form.receiptAtInput) return null;
    return findDuplicate(data.value.appeals, {
      stationId: form.stationId,
      fuel: form.fuel,
      receiptAt: new Date(form.receiptAtInput).toISOString(),
      dealPrice: form.dealPrice ?? 0,
      claimedListPrice: form.claimedListPrice ?? 0,
      volume: form.volume ?? 0,
    });
  }

  return {
    data,
    stations,
    priceVersions,
    appeals,
    previewIntake,
    submitIntake,
    review,
    supplement,
    addPriceVersion,
    canRemoveVersion,
    removePriceVersion,
    removeAppeal,
    resetDemo,
    stationName,
    usageToday,
    duplicateOf,
  };
});
