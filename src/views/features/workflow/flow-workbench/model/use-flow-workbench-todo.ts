/**
 * @module app:views/features/workflow/flow-workbench/model/use-flow-workbench-todo
 * 职责：工作台当前标签、正式查询视图及运行实例装配。
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

export function useFlowWorkbenchTodo(tool: (navigationId: string) => PageTool) {
  const activeTab = ref<FlowWorkbenchTab>('pending')
  function selectTab(value: string | number): void {
    if (value !== 'pending' && value !== 'processed' && value !== 'shared' && value !== 'started') {
      throw Error('流程工作台标签未登记')
    }
    activeTab.value = value
  }
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

  return {activeTab, selectTab, ...runtime}
}
