<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { Appeal } from "../domain/types";
import {
  BLOCK_DESCRIPTIONS,
  REVIEW_DESCRIPTIONS,
  canSupplement,
} from "../domain/rules";
import { useAppealStore } from "../stores/appeal";
import { STATUS_CLASS, STATUS_LABELS, formatDateTime, money, priceText } from "../ui/format";

const props = defineProps<{ appeal: Appeal }>();
const emit = defineEmits<{ (e: "flash", payload: { ok: boolean; message: string }): void }>();

const store = useAppealStore();

const showReview = ref(false);
const showSupplement = ref(false);

const reviewForm = reactive({ basis: "", reviewer: "" });
const supplementForm = reactive({ listPrice: 0, reason: "", operator: "" });

function approve() {
  const r = store.approveReview(props.appeal.id, reviewForm.basis, reviewForm.reviewer);
  emit("flash", r);
  if (r.ok) showReview.value = false;
}

function reject() {
  const r = store.rejectAppeal(props.appeal.id, reviewForm.basis, reviewForm.reviewer);
  emit("flash", r);
  if (r.ok) showReview.value = false;
}

function submitSupplement() {
  const r = store.supplement(props.appeal.id, { ...supplementForm });
  emit("flash", r);
  if (r.ok) showSupplement.value = false;
}

const supplementReady = computed(() => canSupplement(props.appeal));
const matchedVersion = computed(() => store.versionById(props.appeal.frozenPrice?.versionId));
const supplementVersion = computed(() => store.versionById(props.appeal.supplementVersionId));
</script>

<template>
  <article class="record" :class="`card-${appeal.status.toLowerCase()}`">
    <div class="record-head">
      <div>
        <p class="record-title">{{ store.stationName(appeal.stationId) }} · {{ appeal.fuel }}</p>
        <p class="record-sub">{{ appeal.code }} · 申诉人 {{ appeal.applicant }}<template v-if="appeal.contact"> · {{ appeal.contact }}</template></p>
      </div>
      <span class="status" :class="STATUS_CLASS[appeal.status]">{{ STATUS_LABELS[appeal.status] }}</span>
    </div>

    <div class="details">
      <span>小票时间：{{ formatDateTime(appeal.receiptAt) }}</span>
      <span>成交价：{{ priceText(appeal.dealPrice) }}</span>
      <span>受理时同刻挂牌价：
        <b :class="{ missing: appeal.intakeListPrice === null }">{{ priceText(appeal.intakeListPrice) }}</b>
      </span>
      <span>预计应退：{{ money(appeal.expectedRefund) }}</span>
    </div>

    <ul v-if="appeal.blockReasons.length" class="reason-list block">
      <li v-for="code in appeal.blockReasons" :key="code">⛔ {{ BLOCK_DESCRIPTIONS[code] }}</li>
    </ul>

    <ul v-if="appeal.reviewFlags.length" class="reason-list review">
      <li v-for="code in appeal.reviewFlags" :key="code">⚠️ {{ REVIEW_DESCRIPTIONS[code] }}</li>
    </ul>

    <p v-if="appeal.basis" class="note">依据：{{ appeal.basis }}</p>

    <div v-if="appeal.status === 'APPROVED'" class="frozen-box">
      <div class="frozen-title">🔒 已冻结（通过于 {{ formatDateTime(appeal.frozenAt) }}，计入 {{ appeal.quotaDay }} 额度）</div>
      <div class="details">
        <span>冻结小票：成交价 {{ priceText(appeal.frozenReceipt?.dealPrice) }} · {{ formatDateTime(appeal.frozenReceipt?.receiptAt) }}</span>
        <span>冻结挂牌价：{{ priceText(appeal.frozenPrice?.listPrice) }}</span>
        <span>实退金额：<b>{{ money(appeal.approvedRefund) }}</b></span>
        <span>价格版本：{{ appeal.frozenPrice?.versionId }}</span>
      </div>
      <p v-if="matchedVersion?.frozen" class="frozen-note">版本本体已打冻结标记，后续调价只追加新版本，不覆盖。</p>
    </div>

    <p v-if="appeal.status === 'REJECTED'" class="note reject-note">复核驳回（{{ formatDateTime(appeal.reviewedAt) }} · {{ appeal.reviewedBy }}）：{{ appeal.rejectReason }}</p>

    <div v-if="supplementVersion" class="supplement-note">
      补证版本 {{ supplementVersion.id }}：{{ supplementVersion.listPrice.toFixed(2) }} 元/升，原因「{{ supplementVersion.reason }}」，生效于小票时刻。
    </div>

    <div v-if="appeal.status === 'PENDING_REVIEW'" class="actions">
      <button type="button" @click="showReview = !showReview">复核处理</button>
      <button v-if="supplementReady" type="button" class="secondary" @click="showSupplement = !showSupplement">补证生成新版本</button>
    </div>

    <div v-if="showReview && appeal.status === 'PENDING_REVIEW'" class="inline-form">
      <label>
        复核意见/依据（必填）
        <textarea v-model="reviewForm.basis" placeholder="通过：确认退款；驳回：说明不通过原因" />
      </label>
      <label>
        复核人
        <input v-model="reviewForm.reviewer" type="text" placeholder="复核员姓名" />
      </label>
      <div class="actions">
        <button type="button" @click="approve">复核通过并冻结</button>
        <button type="button" class="danger" @click="reject">驳回</button>
      </div>
    </div>

    <div v-if="showSupplement" class="inline-form">
      <p class="inline-hint">补证不修改任何历史版本，而是在小票时刻追加一个带原因的新版本，并指向原同刻版本。</p>
      <label>
        补证挂牌价（元/升）
        <input v-model.number="supplementForm.listPrice" type="number" min="0" step="0.01" />
      </label>
      <label>
        补证原因（必填）
        <textarea v-model="supplementForm.reason" placeholder="如：现场价格牌照片核对，小票时刻挂牌价应为 7.20 元/升" />
      </label>
      <label>
        操作员
        <input v-model="supplementForm.operator" type="text" placeholder="补证人" />
      </label>
      <div class="actions">
        <button type="button" @click="submitSupplement">生成补证版本</button>
      </div>
    </div>

    <p class="record-foot">受理于 {{ formatDateTime(appeal.createdAt) }}</p>
  </article>
</template>
