<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import AppealForm from "./components/AppealForm.vue";
import AppealList from "./components/AppealList.vue";
import QuotaBoard from "./components/QuotaBoard.vue";
import PriceVersionPanel from "./components/PriceVersionPanel.vue";
import EventLog from "./components/EventLog.vue";
import { useAppealStore } from "./stores/appeal";
import type { ActionResult } from "./domain/types";

const store = useAppealStore();

const tabs = [
  { key: "intake", label: "申诉受理" },
  { key: "quota", label: "退款额度台" },
  { key: "price", label: "价格版本" },
  { key: "events", label: "操作流水" },
] as const;

type TabKey = (typeof tabs)[number]["key"];
const activeTab = ref<TabKey>("intake");

const flash = ref<{ ok: boolean; message: string } | null>(null);
let flashTimer: ReturnType<typeof setTimeout> | undefined;

function onFlash(result: ActionResult) {
  flash.value = result;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = null), 4200);
}

onUnmounted(() => clearTimeout(flashTimer));

function resetDemo() {
  const r = store.resetDemo();
  onFlash(r);
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 价差申诉与退款额度台</p>
          <h1>油品价差申诉与退款额度</h1>
          <p class="subtitle">
            受理价差申诉：录入站点、油品、小票时间、成交价并核对同刻挂牌价；小票早于调价生效、超过二十四小时或重复不予受理。
            站点当日额度内直接通过，超额或挂牌价缺失须写依据并复核；通过即冻结小票与当时价格版本，补证只追加带原因的新版本。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">Pinia</span>
          <span class="tag">规则/档案/展示三层分离</span>
          <span class="tag">localStorage 持久化</span>
        </div>
      </header>

      <section class="metrics">
        <article class="metric"><span>申诉总数</span><strong>{{ store.metric.total }}</strong></article>
        <article class="metric"><span>待复核</span><strong class="num-review">{{ store.metric.pending }}</strong></article>
        <article class="metric"><span>已通过（今日退款）</span><strong>{{ store.metric.refundToday.toFixed(2) }} 元</strong></article>
        <article class="metric"><span>不予受理 / 冻结版本</span><strong>{{ store.metric.blocked }} / {{ store.metric.frozenVersions }}</strong></article>
      </section>

      <nav class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
        <button type="button" class="tab reset" @click="resetDemo">恢复演示数据</button>
      </nav>

      <transition name="fade">
        <div v-if="flash" class="flash" :class="flash.ok ? 'flash-ok' : 'flash-err'">{{ flash.message }}</div>
      </transition>

      <section v-if="activeTab === 'intake'" class="workspace">
        <AppealForm @flash="onFlash" />
        <AppealList @flash="onFlash" />
      </section>

      <section v-else-if="activeTab === 'quota'" class="single">
        <QuotaBoard @flash="onFlash" />
      </section>

      <section v-else-if="activeTab === 'price'" class="single">
        <PriceVersionPanel @flash="onFlash" />
      </section>

      <section v-else class="single">
        <EventLog />
      </section>
    </div>
  </main>
</template>
