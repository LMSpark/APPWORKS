/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/query/runtime-bindings
 * 职责：为原审批工作台装配只读选项投影并捕获正式步骤/实例。
 */
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {LowcodeDataSpaceAssemblerInput} from '@/platform-adapters/data-space/lowcode-data-space-assembler'
import {createFlowRunOptionsBinding} from './options-binding'
import {createFlowRunCandidatesBinding} from './candidates-binding'
import {createFlowRunContinuationBinding} from './continuation-binding'
import {createFlowRunPageClient, type FlowRunPageClientOptions} from '../flow-run-page-client'
import {FLOW_WORKBENCH_SCENARIO_ID, FLOW_MONITOR_SCENARIO_ID} from '../../flow-runtime-client'
import {isRecord} from '@spark-appworks/spark-utils'
import {createFlowAppendDictionaryBindings} from '../../flow-append-user/dictionary-bindings'
import {createFlowAppendOptionsBinding} from '../../flow-append-user/options-binding'
import {createFlowAppendUserClient} from '../../flow-append-user/flow-append-user-client'

type Input = Readonly<{config: ScenarioViewConfig; http: FlowRunPageClientOptions['http']; readScope: FlowRunPageClientOptions['readScope']; assertCurrent: () => void}>
export function createApprovalOptionsBindings(input: Input): Pick<LowcodeDataSpaceAssemblerInput, 'projectionBindings'> {
  if (input.config.scenarioId !== FLOW_WORKBENCH_SCENARIO_ID) return {}
  const tables = input.config.toJSON()['tables'], declared = isRecord(tables) ? tables['ApprovalOptions'] : undefined
  if (!isRecord(declared) || declared['resourceType'] !== 'logical-view' || declared['resourceId'] !== 'workflow:approval-options' || Object.hasOwn(declared, 'modelBinding')) throw Error('审批选项投影声明无效')
  const candidates = isRecord(tables) ? tables['ApprovalCandidates'] : undefined
  if (!isRecord(candidates) || candidates['resourceType'] !== 'logical-view' || candidates['resourceId'] !== 'workflow:approval-candidates' || Object.hasOwn(candidates, 'modelBinding')) throw Error('审批候选投影声明无效')
  return {projectionBindings: {...createFlowAppendDictionaryBindings(input), ApprovalOptions: view => {
    const ds = view.dataSet
    const guard = () => {input.assertCurrent(); if (!ds || ds.destroyed || view.destroyed || ds.getView('ApprovalOptions') !== view) throw Error('审批选项空间已失效')}
    const client = createFlowRunPageClient({http: input.http, readScope: input.readScope, scenarioId: FLOW_MONITOR_SCENARIO_ID, assertCurrent: guard})
    return createFlowRunOptionsBinding({view, client, guard, captureTarget: params => {
      guard()
      const steps = ds?.getView('WFOBJ_FLOW_RELATIONLINE_STEP'), objects = ds?.getView('WFOBJ_FLOW')
      const matches = steps?.rows.filter(row => row['rowid'] === params.stepId) ?? []
      const step = matches[0]
      const instances = objects?.rows.filter(row => row['rowid'] === step?.['WFOBJID'] && row['WFMID'] === params.modelId) ?? []
      const object = instances[0]
      if (!steps || !objects || matches.length !== 1 || instances.length !== 1 || !step || !object) throw Error('审批选项缺少唯一正式目标')
      const assertStep = steps.captureReadRow(step, ['rowid', 'WFOBJID']), assertObject = objects.captureReadRow(object, ['rowid', 'WFMID'])
      return () => {guard(); assertStep(); assertObject()}
    }})
  }, ApprovalCandidates: view => {
    const ds = view.dataSet, source = ds?.getView('ApprovalOptions', 'default')
    if (!source) throw Error('审批人员候选缺少原选项视图')
    return createFlowRunCandidatesBinding({view, source, guard: () => {
      input.assertCurrent()
      if (ds?.destroyed || ds?.getView('ApprovalOptions', 'default') !== source) throw Error('审批人员候选空间已失效')
    }})
  }, AppendOptions: view => {
    const ds = view.dataSet, source = ds?.getView('WFOBJ_FLOW_RELATIONLINE_STEP')
    if (!source) throw Error('追加配置缺少原步骤视图')
    const guard = () => {
      input.assertCurrent()
      if (ds?.destroyed || view.destroyed || ds?.getView('AppendOptions') !== view) throw Error('原追加配置空间已失效')
    }
    const client = createFlowAppendUserClient({http: input.http, readScope: input.readScope, scenarioId: FLOW_MONITOR_SCENARIO_ID, assertCurrent: guard})
    return createFlowAppendOptionsBinding({view, source, client, guard})
  }, AppendCandidates: view => {
    const source = view.dataSet?.getView('AppendOptions')
    if (!source) throw Error('追加候选缺少原配置视图')
    return createFlowRunCandidatesBinding({view, source, resourceId: 'workflow:append-candidates', guard: input.assertCurrent})
  }, ApprovalContinuation: view => {
    const ds = view.dataSet, source = ds?.getView('ApprovalOptions')
    if (!source) throw Error('自动后继缺少原办理选项')
    const guard = () => {input.assertCurrent(); if (ds?.destroyed || view.destroyed) throw Error('自动后继空间已失效')}
    const client = createFlowRunPageClient({http: input.http, readScope: input.readScope, scenarioId: FLOW_MONITOR_SCENARIO_ID, assertCurrent: guard})
    return createFlowRunContinuationBinding({view, source, client, guard})
  }}}
}
