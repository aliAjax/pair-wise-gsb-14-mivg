<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { FUEL_TYPES, type FuelType } from "../domain/types";
import type { IntakeFormInput } from "../stores/appeal";
import { useAppealStore } from "../stores/appeal";
import {
  BLOCK_DESCRIPTIONS,
  REVIEW_DESCRIPTIONS,
} from "../domain/rules";
import { isoToLocalInput } from "../domain/time";
import { money, priceText } from "../ui/format";

const emit = defineEmits<{ (e: "flash", payload: { ok: boolean; message: string }): void }>();

const store = useAppealStore();

const nowLocal = isoToLocalInput(new Date().toISOString());

const form = reactive({
  stationId: store.stations[0]?.id ?? "",
  fuel: FUEL_TYPES[0] as FuelType,
  receiptInput: nowLocal,
  dealPrice: 0,
  applicant: "",
  contact: "",
});
const basis = ref("");

const canPreview = computed(
  () =>
    !!form.stationId &&
    !!form.fuel &&
    !!form.receiptInput &&
    Number.isFinite(Number(form.dealPrice)),
);

// 实时预判：与提交落库共用同一套规则纯函数
const verdict = computed(() => {
  if (!canPreview.value) return null;
  try {
    return store.previewIntake(form as IntakeFormInput);
  } catch {
    return null;
  }
});

function submit() {
  const result = store.submitAppeal(form as IntakeFormInput, basis.value);
  emit("flash", result);
  if (result.ok) {
    form.dealPrice = 0;
    form.applicant = "";
    form.contact = "";
    basis.value = "";
    form.receiptInput = isoToLocalInput(new Date().toISOString());
  }
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>价差申诉受理</h2>
    <p class="panel-hint">录入站点、油品、小票时间、成交价与同刻挂牌价（系统自动核对）。命中阻断规则即不予受理。</p>

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
          <option v-for="f in FUEL_TYPES" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>

      <label>
        小票时间
        <input v-model="form.receiptInput" type="datetime-local" :max="nowLocal" required />
      </label>

      <label>
        成交价（元/升）
        <input v-model.number="form.dealPrice" type="number" min="0" step="0.01" required />
      </label>

      <label>
        申诉人
        <input v-model="form.applicant" type="text" placeholder="姓名/车队" required />
      </label>

      <label>
        联系方式（选填）
        <input v-model="form.contact" type="text" placeholder="手机号" />
      </label>
    </div>

    <div v-if="verdict" class="verdict" :class="{ blocked: verdict.blocked, review: verdict.needsReview && !verdict.blocked, pass: !verdict.blocked && !verdict.needsReview }">
      <div class="verdict-row">
        <span>同刻挂牌价</span>
        <strong :class="{ missing: verdict.listPrice === null }">{{ priceText(verdict.listPrice) }}</strong>
      </div>
      <div class="verdict-row">
        <span>预计应退价差</span>
        <strong>{{ money(verdict.expectedRefund) }}</strong>
      </div>
      <div class="verdict-row">
        <span>站点当日额度</span>
        <strong>
          已用 {{ verdict.usedToday.toFixed(2) }} /
          {{ verdict.dailyLimit === null ? "未设置" : ` ${verdict.dailyLimit.toFixed(2)} 元` }}
          <template v-if="verdict.projectedUsage !== null">· 计本单后 {{ verdict.projectedUsage.toFixed(2) }} 元</template>
        </strong>
      </div>

      <ul v-if="verdict.blockReasons.length" class="reason-list block">
        <li v-for="code in verdict.blockReasons" :key="code">⛔ {{ BLOCK_DESCRIPTIONS[code] }}</li>
      </ul>
      <ul v-else-if="verdict.reviewFlags.length" class="reason-list review">
        <li v-for="code in verdict.reviewFlags" :key="code">⚠️ {{ REVIEW_DESCRIPTIONS[code] }}</li>
      </ul>
      <p v-else class="reason-pass">✅ 未命中阻断，且在当日额度内，可直接通过。</p>
    </div>

    <label v-if="verdict?.needsReview && !verdict.blocked">
      处理依据（超额/挂牌价缺失必须填写）
      <textarea v-model="basis" placeholder="说明超额情况或挂牌价缺失原因，将随单进入复核" />
    </label>

    <button type="submit" class="full">
      {{ verdict?.blocked ? "登记为不予受理" : verdict?.needsReview ? "提交复核" : "受理并直接通过" }}
    </button>
  </form>
</template>
