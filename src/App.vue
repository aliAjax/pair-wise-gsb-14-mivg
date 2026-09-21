<script setup lang="ts">
import { computed } from "vue";
import { useAppealStore } from "./stores/appeal";
import { dayKey } from "./domain/time";
import QuotaPanel from "./components/QuotaPanel.vue";
import IntakeForm from "./components/IntakeForm.vue";
import AppealList from "./components/AppealList.vue";
import PriceVersionLedger from "./components/PriceVersionLedger.vue";

const store = useAppealStore();

const stack = ["Vue3", "Vite", "TypeScript", "Pinia"] as const;

const metrics = computed(() => {
  const appeals = store.appeals;
  const pending = appeals.filter((a) => a.status === "PENDING_REVIEW").length;
  const blocked = appeals.filter((a) => a.status === "BLOCKED").length;
  const approvedToday = appeals.filter(
    (a) => a.status === "APPROVED" && a.approvedAt && dayKey(a.approvedAt) === dayKey(new Date().toISOString())
  ).length;
  const refundToday = store.stations.reduce(
    (sum, s) => sum + store.usageToday(s.id).used,
    0
  );
  return [
    { label: "待复核申诉", value: pending },
    { label: "今日已通过", value: approvedToday },
    { label: "今日已退款（元）", value: refundToday.toFixed(2) },
    { label: "累计阻断", value: blocked },
  ];
});
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 价差闭环</p>
          <h1>价差申诉与退款额度台</h1>
          <p class="subtitle">
            受理价差申诉并校验小票时效与重复；站点当日额度内直接通过，超额或挂牌价缺失须写依据复核；
            通过即冻结小票与当时价格版本，补证只追加带原因的新版本。规则、本地档案与展示各自独立。
          </p>
        </div>
        <div class="top-side">
          <div class="stack">
            <span v-for="item in stack" :key="item" class="tag">{{ item }}</span>
          </div>
          <button class="secondary reset" type="button" @click="store.resetDemo()">重置演示数据</button>
        </div>
      </header>

      <section class="metrics four">
        <article v-for="m in metrics" :key="m.label" class="metric">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
        </article>
      </section>

      <QuotaPanel />

      <section class="workspace">
        <div class="left-col">
          <IntakeForm />
        </div>
        <AppealList />
      </section>

      <PriceVersionLedger />

      <footer class="foot">
        数据保存在浏览器 localStorage；刷新 / 重载后申诉、额度、价格版本关系与阻断原因保持对应。
      </footer>
    </div>
  </main>
</template>

<style scoped>
.top-side { display: grid; gap: 10px; justify-items: end; }
.reset { font-size: 12px; padding: 7px 12px; }
.metrics.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.left-col { display: grid; align-content: start; gap: 18px; }
.quota-panel { margin-bottom: 18px; }
.workspace { align-items: start; }
:deep(.workspace .list-panel) { min-height: 100%; }
.foot { margin: 18px 0 8px; color: #7a859b; font-size: 12px; text-align: center; }
@media (max-width: 860px) {
  .metrics.four { grid-template-columns: repeat(2, 1fr); }
  .top-side { justify-items: start; }
}
</style>
