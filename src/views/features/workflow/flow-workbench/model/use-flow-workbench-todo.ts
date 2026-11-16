/**
 * @module app:views/features/workflow/flow-workbench/model/use-flow-workbench-todo
 * 职责：工作台四页签绑定与列定义。
 */
import {computed, ref} from 'vue'
import type {SparkNode} from '@spark-appworks/spark-data'
import type {RFilterProps} from '@spark-appworks/spark-component'
import {
  flowWorkbenchTabBinding,
  type FlowWorkbenchTab,
} from '@/lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-filters'
import {readLowcodePrincipal} from '@/lowcode/lowcode-runtime'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

import {FLOW_MONITOR_SCENARIO_ID, FLOW_WORKBENCH_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'

const SCENARIO_ID = FLOW_WORKBENCH_SCENARIO_ID

const TAB_ITEMS = [
  {id: 'pending' as const, label: '待处理'},
  {id: 'processed' as const, label: '已处理'},
  {id: 'shared' as const, label: '传阅分享'},
  {id: 'started' as const, label: '我发起'},
]

function textColumn(field: string, label: string, minWidth = 140): SparkNode {
  return {type: 'r-text', props: {field, label, readonly: true, minWidth, showOverflowTooltip: true}}
}

export function useFlowWorkbenchTodo() {
  const activeTab = ref<FlowWorkbenchTab>('pending')
  const binding = computed(() => flowWorkbenchTabBinding(activeTab.value))

  const runtime = useFeaturePageRuntime({
    scenarioId: SCENARIO_ID,
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

  const columns = computed((): SparkNode[] => {
    const tab = activeTab.value
    if (tab === 'pending') {
      return [
        textColumn('NodeName', '当前节点', 160),
        textColumn('UserName', '待办人', 120),
        textColumn('wfid', '实例', 140),
        textColumn('FlowID', '模型', 120),
      ]
    }
    if (tab === 'started') {
      return [
        textColumn('TITLE', '流程标题', 200),
        textColumn('AppDesc', '应用', 140),
        textColumn('status', '状态', 90),
        textColumn('CrtTime', '创建时间', 160),
      ]
    }
    return [
      textColumn('description', '摘要', 220),
      textColumn('STARTTIME', '时间', 160),
      textColumn('StepState', '状态', 90),
      textColumn('WFOBJID', '实例', 140),
    ]
  })

  const filter = computed((): RFilterProps => {
    const tab = activeTab.value
    if (tab === 'pending') {
      return {
        autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
        children: [
          {type: 'r-text', props: {field: 'NodeName', label: '节点名称', placeholder: '节点名称', filterTrim: true}},
          {type: 'r-text', props: {field: 'UserName', label: '待办人', placeholder: '待办人', filterTrim: true}},
        ],
      }
    }
    if (tab === 'started') {
      return {
        autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
        children: [
          {type: 'r-text', props: {field: 'TITLE', label: '流程标题', placeholder: '流程标题', filterTrim: true}},
        ],
      }
    }
    return {
      autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
      children: [
        {type: 'r-text', props: {field: 'description', label: '摘要', placeholder: '摘要', filterTrim: true}},
      ],
    }
  })

  const showRunAction = computed(() => activeTab.value === 'pending')

  return {
    TAB_ITEMS,
    activeTab,
    binding,
    showRunAction,
    columns,
    filter,
    ...runtime,
  }
}