<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { FUELS, type Fuel, type PriceVersion } from "../domain/types";
import { useAppealStore } from "../stores/appeal";
import { formatDateTime, toLocalInputValue, nowIso } from "../domain/time";

const store = useAppealStore();

const form = reactive({
  fuel: "92号汽油" as Fuel,
  listPrice: 7.5,
  effectiveFromInput: toLocalInputValue(nowIso()),
  operator: "",
  reason: "",
});
const error = ref("");

const rows = computed(() =>
  [...store.priceVersions]
    .sort((a, b) => +new Date(b.effectiveFrom) - +new Date(a.effectiveFrom))
    .map((v: PriceVersion) => ({
      ...v,
      referenced: !store.canRemoveVersion(v.id),
    }))
);

function add() {
  error.value = "";
  try {
    store.addPriceVersion({
      fuel: form.fuel,
      listPrice: Number(form.listPrice),
      effectiveFromInput: form.effectiveFromInput,
      operator: form.operator,
      reason: form.reason,
    });
    form.reason = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

function remove(id: string) {
  error.value = "";
  try {
    store.removePriceVersion(id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>挂牌价版本台账</h2>
      <span class="muted">只追加；已被冻结引用的版本不可删</span>
    </div>

    <form class="ledger-form" @submit.prevent="add">
      <label>
        油品
        <select v-model="form.fuel">
          <option v-for="f in FUELS" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
      <label>
        挂牌价
        <input v-model.number="form.listPrice" type="number" step="0.01" min="0.01" required />
      </label>
      <label>
        生效时间
        <input v-model="form.effectiveFromInput" type="datetime-local" required />
      </label>
      <label>
        操作员
        <input v-model="form.operator" placeholder="可选，默认值班员" />
      </label>
      <label class="full">
        调价原因
        <input v-model="form.reason" placeholder="如：跟随主营降价" />
      </label>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button type="submit" class="full">追加价格版本</button>
    </form>

    <div class="version-list">
      <div v-for="v in rows" :key="v.id" class="version-row">
        <div class="version-main">
          <strong>{{ v.fuel }} · {{ v.listPrice.toFixed(2) }} 元/升</strong>
          <span class="muted">{{ formatDateTime(v.effectiveFrom) }} 起生效 · {{ v.operator }} · {{ v.reason }}</span>
        </div>
        <span v-if="v.referenced" class="lock-tag">🔒 已冻结</span>
        <button v-else class="secondary tiny" type="button" @click="remove(v.id)">删除</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.muted { color: #7a859b; font-size: 12px; }
.ledger-form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.ledger-form .full { grid-column: 1 / -1; }
.version-list { display: grid; gap: 8px; max-height: 320px; overflow: auto; }
.version-row {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  border: 1px solid #dfe7f1; border-radius: 8px; padding: 10px 12px; background: #fbfcfe;
}
.version-main { display: grid; gap: 3px; font-size: 14px; }
.lock-tag { color: #14724f; font-size: 12px; white-space: nowrap; font-weight: 700; }
.tiny { padding: 6px 10px; font-size: 12px; }
.error-text { grid-column: 1 / -1; margin: 0; color: #c84b31; font-size: 13px; }
</style>
