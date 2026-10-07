<!--
@module @spark-appworks/spark-component:ai/components/session/SessionStreamView/SessionStreamView
职责：维护 @spark-appworks/spark-component 中 ai/components/SessionStreamView 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
AI用途：需要定位 ai/components/SessionStreamView 的声明、导出和使用边界时，从本模块开始。
-->
<template>
  <el-card :class="$style['stream-view']" shadow="never">
    <div v-if="entries.length === 0" :class="$style['stream-view__empty']">
      <el-empty :description="emptyText" />
    </div>
    <div v-else :class="$style['stream-view__list']">
      <template v-for="(entry, index) in entries" :key="index">
        <SessionChatBubble
          v-if="entry.kind === 'user-message'"
          role="user"
          :content="entry.content"
          :timestamp="entry.timestamp"
        />
        <SessionChatBubble
          v-else-if="entry.kind === 'assistant-delta'"
          role="assistant"
          :content="entry.content"
          :is-typing="isStreaming"
        />
        <SessionChatBubble
          v-else-if="entry.kind === 'assistant-complete'"
          role="assistant"
          :content="entry.content"
        />
        <SessionReasoningBlock
          v-else-if="entry.kind === 'reasoning'"
          :text="entry.item.text"
          :collapsed="entry.item.collapsed"
          :is-active="isReasoning && !entry.item.collapsed"
        />
        <SessionToolCallCard
          v-else-if="entry.kind === 'tool-call'"
          :tool-call="entry.item"
        />
        <SessionChatBubble
          v-else-if="entry.kind === 'error'"
          role="error"
          :content="entry.message"
          :timestamp="entry.timestamp"
        />
        <SessionChatBubble
          v-else-if="entry.kind === 'system-message'"
          role="system"
          :content="entry.content"
          :timestamp="entry.timestamp"
        />
      </template>
    </div>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 流式消息主视图。按 StreamDisplayEntry.kind 分发到对应子组件。
 */
import SessionChatBubble from '../SessionChatBubble/SessionChatBubble.vue'
import SessionReasoningBlock from '../SessionReasoningBlock/SessionReasoningBlock.vue'
import SessionToolCallCard from '../SessionToolCallCard/SessionToolCallCard.vue'
import type { SessionStreamViewProps } from './SessionStreamView.props'

withDefaults(defineProps<SessionStreamViewProps>(), {
  emptyText: '等待 AI 响应...',
})
</script>

<style module>
.stream-view {
  height: 100%;
}

.stream-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.stream-view__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
