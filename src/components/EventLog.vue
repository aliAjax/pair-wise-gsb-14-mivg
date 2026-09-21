<script setup lang="ts">
import { useAppealStore } from "../stores/appeal";
import { EVENT_LABELS, formatDateTime } from "../ui/format";

const store = useAppealStore();
</script>

<template>
  <section class="list-panel event-panel">
    <h2>操作流水</h2>
    <p class="panel-hint">受理、阻断、补证、复核、调价与额度变更均留痕，随本地档案一起持久化，重载后可追溯。</p>
    <ul class="event-list">
      <li v-for="event in store.events" :key="event.id" class="event-item">
        <span class="event-kind" :class="`kind-${event.kind.toLowerCase()}`">{{ EVENT_LABELS[event.kind] }}</span>
        <span class="event-message">{{ event.message }}</span>
        <span class="event-time">{{ formatDateTime(event.at) }}</span>
      </li>
      <li v-if="store.events.length === 0" class="empty">暂无流水</li>
    </ul>
  </section>
</template>
