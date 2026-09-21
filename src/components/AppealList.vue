<script setup lang="ts">
import { computed, ref } from "vue";
import type { AppealStatus } from "../domain/types";
import { useAppealStore } from "../stores/appeal";
import AppealCard from "./AppealCard.vue";

const store = useAppealStore();

const FILTERS: { key: AppealStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "全部申诉" },
  { key: "PENDING_REVIEW", label: "待复核" },
  { key: "APPROVED", label: "已通过" },
  { key: "BLOCKED", label: "不予受理" },
  { key: "REJECTED", label: "已驳回" },
];

const statusLabel: Record<AppealStatus, string> = {
  BLOCKED: "不予受理",
  PENDING_REVIEW: "待复核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};

const filter = ref<(typeof FILTERS)[number]["key"]>("ALL");

const list = computed(() =>
  filter.value === "ALL"
    ? store.appeals
    : store.appeals.filter((a) => a.status === filter.value)
);

const chartRows = computed(() =>
  (["PENDING_REVIEW", "APPROVED", "BLOCKED", "REJECTED"] as AppealStatus[]).map((s) => ({
    status: s,
    label: statusLabel[s],
    value: store.appeals.filter((a) => a.status === s).length,
  }))
);
const maxChart = computed(() => Math.max(1, ...chartRows.value.map((r) => r.value)));
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>申诉台账</h2>
      <select v-model="filter">
        <option v-for="f in FILTERS" :key="f.key" :value="f.key">{{ f.label }}</option>
      </select>
    </div>

    <div class="record-grid">
      <div v-if="list.length === 0" class="empty">暂无匹配申诉</div>
      <AppealCard v-for="a in list" :key="a.id" :appeal="a" />
    </div>

    <div class="mini-chart">
      <div v-for="row in chartRows" :key="row.status" class="bar">
        <span>{{ row.label }}</span>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" />
        </div>
        <strong>{{ row.value }}</strong>
      </div>
    </div>
  </section>
</template>
