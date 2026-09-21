<script setup lang="ts">
import { reactive, ref } from "vue";
import { useAppealStore } from "../stores/appeal";

const emit = defineEmits<{ (e: "flash", payload: { ok: boolean; message: string }): void }>();

const store = useAppealStore();
const editingId = ref<string | null>(null);
const draft = reactive<{ limit: number }>({ limit: 0 });

function startEdit(stationId: string, current: number) {
  editingId.value = stationId;
  draft.limit = current;
}

function save(stationId: string) {
  const r = store.updateQuota(stationId, draft.limit);
  emit("flash", r);
  if (r.ok) editingId.value = null;
}

function percent(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>站点当日退款额度</h2>
      <span class="day-tag">归属日：{{ store.today }}</span>
    </div>
    <p class="panel-hint">当日累计退款在额度内的申诉可直接通过；预计超额须写依据并复核。额度只按站点、按决策当日累计。</p>

    <div class="quota-grid">
      <article v-for="row in store.quotasView" :key="row.station.id" class="quota-card" :class="{ over: row.over }">
        <div class="quota-head">
          <strong>{{ row.station.name }}</strong>
          <span class="quota-id">{{ row.station.id }}</span>
        </div>
        <div class="bar-track quota-bar">
          <div
            class="bar-fill"
            :class="{ 'fill-over': row.over }"
            :style="{ width: `${percent(row.used, row.limit)}%` }"
          />
        </div>
        <p class="quota-line">
          已用 <b :class="{ missing: row.over }">{{ row.used.toFixed(2) }}</b> / {{ row.limit.toFixed(2) }} 元
          · 剩余 <b>{{ row.remaining === null ? "—" : row.remaining.toFixed(2) }}</b> 元
        </p>
        <p v-if="row.over" class="quota-warn">⚠️ 当日退款已超额，新申诉将强制复核</p>

        <div v-if="editingId === row.station.id" class="inline-edit">
          <input v-model.number="draft.limit" type="number" min="0" step="0.01" />
          <div class="actions">
            <button type="button" @click="save(row.station.id)">保存</button>
            <button type="button" class="secondary" @click="editingId = null">取消</button>
          </div>
        </div>
        <button v-else type="button" class="secondary mini" @click="startEdit(row.station.id, row.limit)">调整日额度</button>
      </article>
    </div>
  </section>
</template>
