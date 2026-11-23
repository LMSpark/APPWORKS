/**
 * @module app:views/features/workflow/flow-workbench/model/use-flow-workbench-todo
 * 职责：工作台四页签绑定与列定义。
 */
import {computed, ref} from 'vue'
import type {PageTool} from '@spark-appworks/spark-project-model'
import {
  flowWorkbenchTabBinding,
  type FlowWorkbenchTab,
} from '@/platform-adapters/resources/system/workflow/manage/flow-workbench/flow-workbench-filters'
import {readLowcodePrincipal} from '@/platform-adapters/lowcode-runtime'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

import {FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/platform-adapters/resources/system/workflow/manage'

const SCENARIO_ID = FLOW_WORKBENCH_SCENARIO_ID

const TAB_ITEMS = [
  {id: 'pending' as const, label: '待处理'},
  {id: 'processed' as const, label: '已处理'},
  {id: 'shared' as const, label: '传阅分享'},
  {id: 'started' as const, label: '我发起'},
]

export function useFlowWorkbenchTodo(tool: (navigationId: string) => PageTool) {
  const activeTab = ref<FlowWorkbenchTab>('pending')
  const binding = computed(() => flowWorkbenchTabBinding(activeTab.value))

  const runtime = useFeaturePageRuntime({
    scenarioId: SCENARIO_ID,
    tool,
    navigationId: FLOW_MONITOR_SCENARIO_ID,
    modelName: () => binding.value.modelName,
    viewId: () => binding.value.viewId,
    componentType: 'flow-workbench-todo-panel',
    title: '流程待办',
    queryContext: () => {
      const userId = readLowcodePrincipal()?.userId ?? ''
      if (!userId) throw new Error('流程待办缺少当前登录用户 ID')
      return {currentUserId: userId}
    },
  })

  return {TAB_ITEMS, activeTab, ...runtime}
}
