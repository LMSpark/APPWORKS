/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/command/runtime-bindings
 * 职责：将审批命令绑定原运行工作台DataSet及已读取的实例/步骤。
 */
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {parseDataViewKey, resolveDataViewKey} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {FlowRunCommandResource} from './flow-run-command-resource'
import {createFlowRunPageClient, type FlowRunPageClientOptions} from '../flow-run-page-client'
import {FLOW_WORKBENCH_SCENARIO_ID, FLOW_MONITOR_SCENARIO_ID} from '../../flow-runtime-client'
import {canRevokeFlowAppendRecord} from '../../flow-append-user/flow-append-user-records'
import {captureAppendConfiguration, captureAppendSelection, readFlowAppendReceivers} from '../../flow-append-user/command-input'
import {createFlowAppendUserClient} from '../../flow-append-user/flow-append-user-client'

type Input = Readonly<{config: ScenarioViewConfig; http: FlowRunPageClientOptions['http']; readScope: FlowRunPageClientOptions['readScope']; assertCurrent: () => void}>
export function createApprovalCommandBindings(input: Input): Pick<LowcodeDataSpaceAssemblerInput, 'commandBindings'> {
  if (input.config.scenarioId !== FLOW_WORKBENCH_SCENARIO_ID) return {}
  const tables = input.config.toJSON()['tables']
  const table = isRecord(tables) ? tables['ApprovalCommand'] : undefined
  if (!isRecord(table) || table['resourceType'] !== 'command' || table['resourceId'] !== 'workflow:approval') throw Error('审批场景缺少正式命令声明')
  return {commandBindings: {ApprovalCommand: view => {
    const ds = view.dataSet
    const guard = () => {
      input.assertCurrent()
      if (!ds || ds.destroyed || ds.scenarioId !== FLOW_WORKBENCH_SCENARIO_ID || ds.getView('ApprovalCommand') !== view) throw Error('审批命令所属空间失效')
    }
    const client = createFlowRunPageClient({http: input.http, readScope: input.readScope, scenarioId: FLOW_MONITOR_SCENARIO_ID, assertCurrent: guard})
    const appendClient = createFlowAppendUserClient({http: input.http, readScope: input.readScope, scenarioId: FLOW_MONITOR_SCENARIO_ID, assertCurrent: guard})
    return new FlowRunCommandResource({view, guard,
      captureInput: row => row['action'] === 'append' ? captureAppendSelection(ds, row) : undefined,
      captureTarget: row => {
        guard()
        const key = row['targetStepViewKey'], explicit = key !== undefined && key !== ''
        const descriptor = typeof key === 'string' ? parseDataViewKey(key) : null
        if (explicit && (row['action'] !== 'revoke' || !descriptor || descriptor.scope !== ds?.scenarioId
          || descriptor.tableName !== 'WFOBJ_FLOW_RELATIONLINE_STEP' || descriptor.viewId !== 'appendParticipants')) throw Error('撤回追加行缺少本空间原步骤完整视图键')
        const steps = explicit && typeof key === 'string' ? resolveDataViewKey(key, ds) : ds?.getView('WFOBJ_FLOW_RELATIONLINE_STEP')
        const instances = ds?.getView('WFOBJ_FLOW')
        const targets = steps?.rows.filter(item => item['rowid'] === row['stepId'] && item['WFOBJID'] === row['flowObjectId']) ?? []
        const objects = instances?.rows.filter(item => item['rowid'] === row['flowObjectId']) ?? []
        const step = targets[0], object = objects[0]
        if (!steps || !instances || targets.length !== 1 || objects.length !== 1 || !step || !object) throw Error('审批命令缺少唯一正式实例或步骤')
        const assertStep = steps.captureReadRow(step, explicit || row['action'] === 'append' ? ['rowid', 'WFOBJID', 'STATUS', 'StepState', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID'] : ['rowid', 'WFOBJID'])
        if (explicit && !canRevokeFlowAppendRecord({STATUS: step['STATUS'], StepState: step['StepState']})) throw Error('原追加步骤当前不可撤回')
        if (row['action'] === 'submit' && (typeof row['flowId'] !== 'string' || !row['flowId'].trim() || row['flowId'] !== object['WFMID'])) throw Error('审批流程模型与正式实例不符')
        const assertObject = instances.captureReadRow(object, ['rowid', 'WFMID'])
        const appendConfig = row['action'] === 'append' ? captureAppendConfiguration(ds, row) : undefined
        if (appendConfig && appendConfig.nodeId !== step['ReceiveNodeModelId']) throw Error('追加配置不是原接收节点')
        return () => {
          guard(); assertStep(); assertObject()
          appendConfig?.assertCurrent()
          if (explicit && typeof key === 'string' && resolveDataViewKey(key, ds) !== steps) throw Error('原追加步骤视图已变化')
        }
      },
      dispatch: async row => {
        const flowObjId = String(row['flowObjectId']), curStepId = String(row['stepId'])
        const params = {flowObjId, curStepId, nodeId: String(row['nodeId'] ?? ''), idea: String(row['idea'] ?? '')}
        switch (row['action']) {
          case 'append': await appendClient.addReceiveUsers({rowid: curStepId, WFOBJID: flowObjId}, readFlowAppendReceivers(row['receiveUsers'])); break
          case 'submit': {
            const nextNode = Array.isArray(row['nextNode']) ? row['nextNode'].map((node: unknown) => {
              if (!isRecord(node) || typeof node['NodeId'] !== 'string') throw Error('审批节点输入无效')
              const users = node['ExecUserList']
              return {NodeId: node['NodeId'], ExecUserList: Array.isArray(users) ? users.filter((user: unknown): user is string => typeof user === 'string') : []}
            }) : []
            await client.submitOrStart({flowId: String(row['flowId'] ?? ''), flowObjId, curStepId, nextNode,
              formKey: String(row['formKey'] ?? ''), formUrl: String(row['formUrl'] ?? ''), formParams: String(row['formParams'] ?? ''),
              busRowid: String(row['busRowid'] ?? ''), idea: params.idea, isReturn: row['isReturn'] === true, notifyType: String(row['notifyType'] ?? ''), type: String(row['type'] ?? '')})
            break
          }
          case 'back': await client.backByHistory(params); break
          case 'forceBack': await client.forceBack(params); break
          case 'toCreator': await client.rejectToCreator(params); break
          case 'revoke': await client.revokeCurrentStep(flowObjId, curStepId); break
          default: throw Error('审批提交结构尚未绑定；本命令不派发')
        }
      },
    }).binding()
  }}}
}
