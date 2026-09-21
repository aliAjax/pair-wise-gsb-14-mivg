<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { FUELS, type Fuel } from "../domain/types";
import { toLocalInputValue, nowIso, formatDateTime } from "../domain/time";
import { useAppealStore } from "../stores/appeal";

const emit = defineEmits<{ submitted: [] }>();
const store = useAppealStore();

const defaultReceipt = () => toLocalInputValue(new Date(Date.now() - 60 * 60 * 1000).toISOString());

const form = reactive({
  stationId: store.stations[0]?.id ?? "",
  fuel: "92号汽油" as Fuel,
  receiptAtInput: defaultReceipt(),
  dealPrice: 7.3,
  claimedListPrice: 7.54,
  volume: 50,
});

const error = ref<string | null>(null);

const preview = computed(() =>
  store.previewIntake({
    stationId: form.stationId,
    fuel: form.fuel,
    receiptAtInput: form.receiptAtInput,
    dealPrice: form.dealPrice === null || Number.isNaN(form.dealPrice) ? null : Number(form.dealPrice),
    claimedListPrice:
      form.claimedListPrice === null || Number.isNaN(form.claimedListPrice)
        ? null
        : Number(form.claimedListPrice),
    volume: form.volume === null || Number.isNaN(form.volume) ? null : Number(form.volume),
  })
);

const projected = computed(() => {
  if (!preview.value || preview.value.estimatedRefund === null) return null;
  return Math.round((preview.value.usedToday + preview.value.estimatedRefund) * 100) / 100;
});

function submit() {
  error.value = null;
  try {
    store.submitIntake({
      stationId: form.stationId,
      fuel: form.fuel,
      receiptAtInput: form.receiptAtInput,
      dealPrice: Number(form.dealPrice),
      claimedListPrice: Number(form.claimedListPrice),
      volume: Number(form.volume),
    });
    form.receiptAtInput = defaultReceipt();
    emit("submitted");
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

const nowText = formatDateTime(nowIso());
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>录入价差申诉</h2>
    <p class="hint">小票时间早于调价生效、超过 24 小时或重复提交将被阻断；超额 / 挂牌价缺失须填依据后复核。</p>

    <div class="form-grid">
      <label>
        站点
        <select v-model="form.stationId" required>
          <option v-for="s in store.stations" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>

      <label>
        油品
        <select v-model="form.fuel" required>
          <option v-for="f in FUELS" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>

      <label>
        小票时间
        <input v-model="form.receiptAtInput" type="datetime-local" required />
      </label>

      <label>
        成交价（元/升）
        <input v-model.number="form.dealPrice" type="number" step="0.01" min="0" required />
      </label>

      <label>
        同刻挂牌价（元/升）
        <input v-model.number="form.claimedListPrice" type="number" step="0.01" min="0" required />
      </label>

      <label>
        加油升数（升）
        <input v-model.number="form.volume" type="number" step="0.01" min="0.01" required />
      </label>
    </div>

    <div v-if="preview" class="preview">
      <template v-if="preview.blockReasons.length">
        <p v-for="r in preview.blockReasons" :key="r.code" class="msg block">⛔ {{ r.detail }}</p>
      </template>
      <template v-else>
        <p v-if="preview.matchedVersion" class="msg ok">
          ✓ 匹配价格版本：{{ preview.matchedVersion.listPrice.toFixed(2) }} 元/升
          <span class="muted">（{{ formatDateTime(preview.matchedVersion.effectiveFrom) }} 起生效）</span>
        </p>
        <p v-else class="msg review">⚠ 小票时刻缺少挂牌价版本，复核时须确认挂牌价</p>

        <p v-if="preview.estimatedRefund !== null" class="msg" :class="{ review: projected! > preview.quota, ok: projected! <= preview.quota }">
          预估退款 <strong>{{ preview.estimatedRefund.toFixed(2) }}</strong> 元；
          当日已用 {{ preview.usedToday.toFixed(2) }}，叠加后 {{ projected!.toFixed(2) }} / {{ preview.quota.toFixed(2) }} 元
        </p>

        <p v-for="r in preview.reviewReasons.filter(x => x.code !== 'LIST_PRICE_MISSING')" :key="r.code" class="msg review">
          ⚠ {{ r.detail }}
        </p>
      </template>
    </div>

    <p v-if="error" class="msg block">{{ error }}</p>

    <button type="submit" :disabled="!!(preview && !preview.valid)">
      {{ preview && preview.reviewReasons.length ? "提交并转复核" : "提交申诉" }}
    </button>
    <p class="hint right">当前时间 {{ nowText }}</p>
  </form>
</template>

<style scoped>
.hint { margin: 0 0 12px; color: #7a859b; font-size: 12px; line-height: 1.6; }
.hint.right { text-align: right; margin: 8px 0 0; }
.preview { display: grid; gap: 6px; margin: 4px 0 12px; }
.msg { margin: 0; padding: 8px 10px; border-radius: 8px; font-size: 13px; line-height: 1.55; }
.msg.block { background: #fbeae6; color: #a83a22; }
.msg.review { background: #fdf4e3; color: #9a6208; }
.msg.ok { background: #e8f4ef; color: #14724f; }
.muted { color: #7a859b; font-weight: 400; }
button { width: 100%; }
</style>
