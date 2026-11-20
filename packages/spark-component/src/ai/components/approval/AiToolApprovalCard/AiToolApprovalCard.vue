<!--
@module @spark-appworks/spark-component:ai/components/approval/AiToolApprovalCard/AiToolApprovalCard
职责：维护 @spark-appworks/spark-component 中 ai/components/AiToolApprovalCard 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
AI用途：需要定位 ai/components/AiToolApprovalCard 的声明、导出和使用边界时，从本模块开始。
-->
<template>
  <el-card :class="$style['approval-card']" shadow="never">
    <div :class="$style['approval-card__header']">
      <div :class="$style['approval-card__title']">
        <el-icon :size="14">
          <Tools />
        </el-icon>
        <span>{{ request.toolName }}</span>
        <el-tag size="small" type="info">{{ request.moduleId }}</el-tag>
      </div>
      <el-tag size="small" type="warning">待审批</el-tag>
    </div>

    <div :class="$style['approval-card__args']">
      <div :class="$style['approval-card__label']">参数</div>
      <el-tooltip :content="request.argsPreview" placement="top" :show-after="500">
        <div :class="$style['approval-card__preview']">{{ request.argsPreview }}</div>
      </el-tooltip>
    </div>

    <div :class="$style['approval-card__actions']">
      <template v-if="rejecting">
        <el-input
          v-model="rejectReason"
          placeholder="拒绝原因（可选）"
          size="small"
          :class="$style['approval-card__reason-input']"
        />
        <el-button size="small" type="danger" @click="confirmReject">
          确认拒绝
        </el-button>
        <el-button size="small" @click="rejecting = false">
          取消
        </el-button>
      </template>
      <template v-else>
        <el-button size="small" type="success" @click="emit('allow', request.id)">
          允许
        </el-button>
        <el-button size="small" type="warning" @click="startReject">
          拒绝
        </el-button>
        <el-button size="small" type="danger" @click="emit('abort', request.id, '用户中止')">
          中止
        </el-button>
      </template>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Tools } from '@element-plus/icons-vue'
import type { AiToolApprovalCardProps, AiToolApprovalCardEmits } from './AiToolApprovalCard.props'

const props = defineProps<AiToolApprovalCardProps>()

const emit = defineEmits<AiToolApprovalCardEmits>()

const rejecting = ref(false)
const rejectReason = ref('')

function startReject(): void {
  rejecting.value = true
  rejectReason.value = ''
}

function confirmReject(): void {
  emit('reject', props.request.id, rejectReason.value)
  rejecting.value = false
}
</script>

<style module>
.approval-card {
  margin: 4px 0;
}

.approval-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.approval-card__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
}

.approval-card__args {
  margin-bottom: 10px;
}

.approval-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
}

.approval-card__preview {
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-regular);
  background-color: var(--el-fill-color-light);
  padding: 6px 8px;
  border-radius: 4px;
  max-height: 80px;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-all;
}

.approval-card__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.approval-card__reason-input {
  flex: 1;
  min-width: 160px;
}
</style>
