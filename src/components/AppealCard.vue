<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { Appeal } from "../domain/types";
import { useAppealStore } from "../stores/appeal";
import { formatDateTime } from "../domain/time";

const props = defineProps<{ appeal: Appeal }>();
const store = useAppealStore();

const statusText: Record<Appeal["status"], string> = {
  BLOCKED: "不予受理",
  PENDING_REVIEW: "待复核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};

const stationName = computed(() => store.stationName(props.appeal.stationId));
const needsConfirmedPrice = computed(() =>
  props.appeal.reviewReasons.some((r) => r.code === "LIST_PRICE_MISSING")
);

const reviewForm = reactive({
  basis: "",
  reviewer: "",
  confirmedListPrice: props.appeal.claimedListPrice,
});
const reviewError = ref("");
const showReview = ref(false);

function doReview(approve: boolean) {
  reviewError.value = "";
  try {
    store.review(props.appeal.id, {
      approve,
      basis: reviewForm.basis,
      reviewer: reviewForm.reviewer,
      confirmedListPrice: needsConfirmedPrice.value
        ? Number(reviewForm.confirmedListPrice)
        : null,
    });
    reviewForm.basis = "";
    reviewForm.reviewer = "";
    showReview.value = false;
  } catch (e) {
    reviewError.value = e instanceof Error ? e.message : String(e);
  }
}

const supForm = reactive({ reason: "", evidence: "", operator: "" });
const supError = ref("");
const showSupplement = ref(false);

function doSupplement() {
  supError.value = "";
  try {
    store.supplement(props.appeal.id, { ...supForm });
    supForm.reason = "";
    supForm.evidence = "";
    supForm.operator = "";
    showSupplement.value = false;
  } catch (e) {
    supError.value = e instanceof Error ? e.message : String(e);
  }
}

function remove() {
  try {
    store.removeAppeal(props.appeal.id);
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
}

const removable = computed(
  () => props.appeal.status === "BLOCKED" || props.appeal.status === "REJECTED"
);
</script>

<template>
  <article class="record" :class="`st-${appeal.status.toLowerCase()}`">
    <div class="record-head">
      <div>
        <p class="record-title">{{ stationName }} · {{ appeal.fuel }}</p>
        <p class="code">{{ appeal.code }} · 提交于 {{ formatDateTime(appeal.createdAt) }}</p>
      </div>
      <span class="status" :class="`badge-${appeal.status.toLowerCase()}`">{{ statusText[appeal.status] }}</span>
    </div>

    <div class="details">
      <span>小票时间：{{ formatDateTime(appeal.receiptAt) }}</span>
      <span>成交价：{{ appeal.dealPrice.toFixed(2) }} 元/升</span>
      <span>填报挂牌价：{{ appeal.claimedListPrice.toFixed(2) }} 元/升</span>
      <span>加油升数：{{ appeal.volume }} 升</span>
    </div>

    <!-- 阻断原因 -->
    <div v-if="appeal.blockReasons.length" class="reason-box block">
      <p v-for="r in appeal.blockReasons" :key="r.code">⛔ {{ r.detail }}</p>
    </div>

    <!-- 待复核 -->
    <template v-if="appeal.status === 'PENDING_REVIEW'">
      <div class="reason-box review">
        <p v-for="r in appeal.reviewReasons" :key="r.code">⚠ {{ r.detail }}</p>
        <p v-if="appeal.estimatedRefund !== null" class="muted">
          预估退款：{{ appeal.estimatedRefund.toFixed(2) }} 元
        </p>
      </div>

      <button v-if="!showReview" class="secondary wide" type="button" @click="showReview = true">
        填写依据并复核
      </button>
      <div v-else class="review-form">
        <label>
          复核依据（必填）
          <textarea v-model="reviewForm.basis" placeholder="超额特批说明 / 挂牌价核实情况" />
        </label>
        <label v-if="needsConfirmedPrice">
          确认当时挂牌价（元/升，必填）
          <input v-model.number="reviewForm.confirmedListPrice" type="number" step="0.01" min="0.01" />
        </label>
        <label>
          复核人（必填）
          <input v-model="reviewForm.reviewer" placeholder="姓名" />
        </label>
        <p v-if="reviewError" class="error-text">{{ reviewError }}</p>
        <div class="actions">
          <button type="button" @click="doReview(true)">通过并冻结</button>
          <button class="danger" type="button" @click="doReview(false)">驳回</button>
          <button class="secondary" type="button" @click="showReview = false">取消</button>
        </div>
      </div>
    </template>

    <!-- 已通过：冻结快照 -->
    <template v-if="appeal.status === 'APPROVED' && appeal.frozenReceipt && appeal.frozenPrice">
      <div class="frozen-box">
        <div class="frozen-head">
          <span class="lock">🔒 已冻结（通过后小票与价格版本不可改）</span>
          <strong class="refund">退款 {{ appeal.refund?.toFixed(2) }} 元</strong>
        </div>
        <div class="details">
          <span>冻结挂牌价：{{ appeal.frozenPrice.listPrice?.toFixed(2) }} 元/升</span>
          <span>
            价格版本：{{ appeal.frozenPrice.versionId ? appeal.frozenPrice.versionId.slice(0, 8) : "复核确认（无版本）" }}
          </span>
          <span>版本生效：{{ formatDateTime(appeal.frozenPrice.effectiveFrom) }}</span>
          <span>冻结时刻：{{ formatDateTime(appeal.frozenReceipt.frozenAt) }}</span>
        </div>
        <p v-if="appeal.basis" class="muted">依据：{{ appeal.basis }}（{{ appeal.reviewer }}，{{ formatDateTime(appeal.reviewedAt) }}）</p>
        <p v-if="appeal.confirmedListPrice" class="muted">复核确认挂牌价：{{ appeal.confirmedListPrice.toFixed(2) }} 元/升</p>

        <!-- 补证版本 -->
        <div v-if="appeal.revisions.length" class="revisions">
          <p class="muted strong">补证记录（v1 为通过时冻结版本）</p>
          <div v-for="rev in appeal.revisions" :key="rev.version" class="revision">
            <span class="ver">v{{ rev.version }}</span>
            <div>
              <p>原因：{{ rev.reason }}</p>
              <p>凭证：{{ rev.evidence }} · {{ rev.operator }} · {{ formatDateTime(rev.createdAt) }}</p>
            </div>
          </div>
        </div>

        <button v-if="!showSupplement" class="secondary wide" type="button" @click="showSupplement = true">
          补证（生成带原因的新版本）
        </button>
        <div v-else class="review-form">
          <label>
            补证原因（必填）
            <input v-model="supForm.reason" placeholder="如：补传带时间戳的支付凭证" />
          </label>
          <label>
            补充说明 / 凭证编号（必填）
            <textarea v-model="supForm.evidence" />
          </label>
          <label>
            操作人（必填）
            <input v-model="supForm.operator" />
          </label>
          <p v-if="supError" class="error-text">{{ supError }}</p>
          <div class="actions">
            <button type="button" @click="doSupplement">提交补证</button>
            <button class="secondary" type="button" @click="showSupplement = false">取消</button>
          </div>
        </div>
      </div>
    </template>

    <p v-if="appeal.status === 'REJECTED'" class="reason-box reject">
      驳回依据：{{ appeal.basis }}（{{ appeal.reviewer }}，{{ formatDateTime(appeal.reviewedAt) }}）
    </p>

    <div class="actions">
      <button
        v-if="removable"
        class="secondary"
        type="button"
        @click="remove"
      >删除留痕</button>
    </div>
  </article>
</template>

<style scoped>
.code { margin: 4px 0 0; color: #7a859b; font-size: 12px; }
.wide { width: 100%; margin-top: 10px; }
.reason-box { border-radius: 8px; padding: 10px 12px; margin: 0 0 10px; font-size: 13px; line-height: 1.6; }
.reason-box p { margin: 0; }
.reason-box.block { background: #fbeae6; color: #a83a22; }
.reason-box.review { background: #fdf4e3; color: #9a6208; }
.reason-box.reject { background: #f0f0f4; color: #5b667a; }
.muted { color: #7a859b; }
.strong { font-weight: 700; margin: 8px 0; }
.frozen-box { border: 1px solid #b9d8d2; background: #f1f8f6; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
.frozen-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.lock { color: #14724f; font-size: 13px; font-weight: 700; }
.refund { color: #14724f; font-size: 16px; }
.revisions { margin: 10px 0; display: grid; gap: 8px; }
.revision { display: flex; gap: 10px; background: #fff; border: 1px solid #d9e7e3; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
.revision p { margin: 2px 0; color: #536078; }
.ver { font-weight: 800; color: #176b87; }
.review-form { display: grid; gap: 10px; margin-top: 10px; }
.error-text { margin: 0; color: #c84b31; font-size: 13px; }
.badge-blocked { background: #fbeae6 !important; color: #a83a22 !important; }
.badge-pending_review { background: #fdf4e3 !important; color: #9a6208 !important; }
.badge-approved { background: #e8f4ef !important; color: #14724f !important; }
.badge-rejected { background: #f0f0f4 !important; color: #6b7280 !important; }
</style>
