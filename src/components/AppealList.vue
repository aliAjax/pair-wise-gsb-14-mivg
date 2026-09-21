<script setup lang="ts">
import { computed, ref } from "vue";
import type { AppealStatus } from "../domain/types";
import { useAppealStore } from "../stores/appeal";
import AppealCard from "./AppealCard.vue";

const emit = defineEmits<{ (e: "flash", payload: { ok: boolean; message: string }): void }>();

const store = useAppealStore();

const statusFilter = ref<"ALL" | AppealStatus>("ALL");
const stationFilter = ref<string>("ALL");

const filtered = computed(() =>
  store.appeals.filter((a) => {
    if (statusFilter.value !== "ALL" && a.status !== statusFilter.value) return false;
    if (stationFilter.value !== "ALL" && a.stationId !== stationFilter.value) return false;
    return true;
  }),
);

const statusOptions: { value: "ALL" | AppealStatus; label: string }[] = [
  { value: "ALL", label: "全部状态" },
  { value: "PENDING_REVIEW", label: "待复核" },
  { value: "APPROVED", label: "已通过" },
  { value: "BLOCKED", label: "不予受理" },
  { value: "REJECTED", label: "复核驳回" },
];
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>申诉单列表</h2>
      <div class="filter-group">
        <select v-model="stationFilter">
          <option value="ALL">全部站点</option>
          <option v-for="s in store.stations" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <select v-model="statusFilter">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
    </div>

    <div class="record-grid">
      <div v-if="filtered.length === 0" class="empty">暂无匹配申诉</div>
      <AppealCard v-for="appeal in filtered" :key="appeal.id" :appeal="appeal" @flash="emit('flash', $event)" />
    </div>
  </section>
</template>
