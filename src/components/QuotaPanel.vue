<script setup lang="ts">
import { computed } from "vue";
import { useAppealStore } from "../stores/appeal";
import { todayKey } from "../domain/time";

const store = useAppealStore();

const rows = computed(() =>
  store.stations.map((station) => {
    const usage = store.usageToday(station.id);
    const percent = Math.min(100, Math.round((usage.used / Math.max(usage.quota, 1)) * 100));
    return { station, ...usage, percent, over: usage.used > usage.quota };
  })
);

const today = todayKey();
</script>

<template>
  <section class="panel quota-panel">
    <div class="panel-head">
      <h2>站点当日退款额度</h2>
      <span class="muted">归集日期 {{ today }}</span>
    </div>
    <div class="quota-list">
      <article v-for="row in rows" :key="row.station.id" class="quota-row" :class="{ over: row.over }">
        <div class="quota-top">
          <strong>{{ row.station.name }}</strong>
          <span :class="['quota-num', { warn: row.over }]">
            {{ row.used.toFixed(2) }} / {{ row.quota.toFixed(2) }} 元
          </span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" :class="{ warn: row.over }" :style="{ width: `${row.percent}%` }" />
        </div>
        <p class="quota-foot">
          <span :class="{ warn: row.over }">{{ row.over ? `已超 ${(-row.remaining).toFixed(2)} 元` : `剩余 ${row.remaining.toFixed(2)} 元` }}</span>
        </p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.muted { color: #7a859b; font-size: 12px; }
.quota-list { display: grid; gap: 12px; }
.quota-row {
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 12px 14px;
  background: #fbfcfe;
}
.quota-row.over { border-color: #e3b7a8; background: #fdf3ef; }
.quota-top { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.quota-num { color: #445069; font-size: 13px; white-space: nowrap; }
.warn { color: #c84b31; font-weight: 700; }
.bar-track { height: 8px; border-radius: 999px; background: #e7edf4; overflow: hidden; }
.bar-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #176b87, #64b6ac); }
.bar-fill.warn { background: linear-gradient(90deg, #c84b31, #e08a5b); }
.quota-foot { margin: 8px 0 0; font-size: 13px; color: #5b667a; }
</style>
