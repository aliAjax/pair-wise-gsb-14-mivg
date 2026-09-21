<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { FUEL_TYPES, type FuelType, type PriceVersion } from "../domain/types";
import { useAppealStore } from "../stores/appeal";
import { isoToLocalInput } from "../domain/time";
import { formatDateTime } from "../ui/format";

const emit = defineEmits<{ (e: "flash", payload: { ok: boolean; message: string }): void }>();

const store = useAppealStore();
const showAdd = ref(false);

const form = reactive({
  stationId: store.stations[0]?.id ?? "",
  fuel: FUEL_TYPES[0] as FuelType,
  effectiveInput: isoToLocalInput(new Date().toISOString()),
  listPrice: 0,
  reason: "",
  operator: "",
});

const grouped = computed(() => {
  const map = new Map<string, { stationId: string; stationName: string; fuel: string; versions: PriceVersion[] }>();
  for (const v of store.priceVersions) {
    const key = `${v.stationId}__${v.fuel}`;
    if (!map.has(key)) {
      map.set(key, {
        stationId: v.stationId,
        stationName: store.stationName(v.stationId),
        fuel: v.fuel,
        versions: [],
      });
    }
    map.get(key)!.versions.push(v);
  }
  return [...map.values()].sort((a, b) =>
    `${a.stationName}${a.fuel}`.localeCompare(`${b.stationName}${b.fuel}`, "zh-Hans-CN"),
  );
});

function appealCodeOf(appealId?: string): string {
  if (!appealId) return "";
  return store.appeals.find((a) => a.id === appealId)?.code ?? appealId;
}

function submit() {
  const r = store.addPriceVersion(form);
  emit("flash", r);
  if (r.ok) {
    form.listPrice = 0;
    form.reason = "";
    form.operator = "";
    showAdd.value = false;
  }
}
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>挂牌价版本</h2>
      <button type="button" class="mini" @click="showAdd = !showAdd">{{ showAdd ? "收起调价" : "调整油品价格" }}</button>
    </div>
    <p class="panel-hint">调价只追加版本、永不覆盖；申诉通过后对应版本冻结；补证版本生效于小票时刻并标注原因与来源单。</p>

    <form v-if="showAdd" class="inline-form add-price" @submit.prevent="submit">
      <div class="form-grid two-col">
        <label>站点
          <select v-model="form.stationId">
            <option v-for="s in store.stations" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <label>油品
          <select v-model="form.fuel">
            <option v-for="f in FUEL_TYPES" :key="f" :value="f">{{ f }}</option>
          </select>
        </label>
        <label>生效时间
          <input v-model="form.effectiveInput" type="datetime-local" required />
        </label>
        <label>挂牌价（元/升）
          <input v-model.number="form.listPrice" type="number" min="0" step="0.01" required />
        </label>
        <label class="span-2">调价原因（必填）
          <input v-model="form.reason" type="text" placeholder="如：月度调价" required />
        </label>
        <label>操作员
          <input v-model="form.operator" type="text" />
        </label>
      </div>
      <button type="submit">追加新版本</button>
    </form>

    <div class="version-groups">
      <article v-for="group in grouped" :key="`${group.stationId}-${group.fuel}`" class="version-group">
        <h3>{{ group.stationName }} · {{ group.fuel }}</h3>
        <ol class="version-timeline">
          <li v-for="v in group.versions" :key="v.id" class="version-item" :class="{ frozen: v.frozen }">
            <div class="version-main">
              <strong>{{ v.listPrice.toFixed(2) }} 元/升</strong>
              <span class="version-time">生效 {{ formatDateTime(v.effectiveAt) }}</span>
              <span v-if="v.frozen" class="tag-frozen">🔒 已冻结 · {{ appealCodeOf(v.frozenByAppealId) }}</span>
              <span v-else-if="v.sourceAppealId" class="tag-supplement">补证 · {{ appealCodeOf(v.sourceAppealId) }}</span>
              <span v-else class="tag-normal">调价</span>
            </div>
            <p class="version-reason">{{ v.reason }} <span class="version-meta">（{{ v.operator }} · 建档 {{ formatDateTime(v.createdAt) }}）</span></p>
            <p v-if="v.supersedesId" class="version-chain">替代版本：{{ v.supersedesId }}</p>
          </li>
        </ol>
      </article>
      <div v-if="grouped.length === 0" class="empty">暂无价格版本</div>
    </div>
  </section>
</template>
