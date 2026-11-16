/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/command/flow-run-command-resource
 * 职责：审批命令通过原DataView提交；缺少权威核验合同时保留未知意图。
 */
import type {BindCommandSubmitOptions, DataRow, DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'

type Options = Readonly<{
  view: DataView
  guard: () => void
  dispatch: (row: Readonly<DataRow>) => Promise<void>
  captureTarget: (row: Readonly<DataRow>) => () => void
}>
class FlowRunCommandUnknown extends Error {}
const inputFields = ['action', 'flowObjectId', 'stepId', 'flowId', 'formKey', 'formUrl', 'formParams', 'busRowid', 'nodeId', 'idea', 'notifyType', 'type']
function nodeSignature(value: unknown): string {
  if (value === undefined) return '[]'
  if (!Array.isArray(value)) throw Error('审批下一节点须为数组')
  const nodes = value.map((node: unknown) => {
    if (!isRecord(node) || typeof node['NodeId'] !== 'string' || !node['NodeId'].trim()) throw Error('审批下一节点身份无效')
    const users = node['ExecUserList'] ?? []
    if (!Array.isArray(users) || users.some((user: unknown) => typeof user !== 'string' || !user.trim())) throw Error('审批办理人列表无效')
    if (Object.keys(node).some(key => key !== 'NodeId' && key !== 'ExecUserList')) throw Error('审批节点含未声明输入')
    return [node['NodeId'], users]
  })
  // Only the declared command-input tuple is compared; this is not a second editable state.
  return JSON.stringify(nodes)
}

export class FlowRunCommandResource {
  public constructor(private readonly input: Options) {}

  public binding(): BindCommandSubmitOptions {
    const {view, guard, dispatch} = this.input
    const captures = new Map<unknown, Readonly<{row: Readonly<DataRow>; assertTarget: () => void}>>()
    const dispatched = new Set<unknown>()
    const confirmed = new Map<unknown, DataRow>()
    const assertCapture = (row: Readonly<DataRow>) => {
      const captured = captures.get(row[view.primaryKey])
      if (!captured || inputFields.some(field => captured.row[field] !== row[field]) || nodeSignature(captured.row['nextNode']) !== nodeSignature(row['nextNode'])) {
        throw Error('审批命令与原捕获目标不符')
      }
      captured.assertTarget()
    }
    const assertCurrent = () => {
      guard()
      if (view.destroyed || view.dataSet?.destroyed || view.dataTable?.resourceType !== 'command'
        || view.dataTable.resourceId !== 'workflow:approval') throw Error('审批命令实例已失效')
    }
    return {
      resource: {resourceType: 'command', resourceId: 'workflow:approval'},
      guard: assertCurrent,
      inputFields: [...inputFields, 'nextNode'],
      createKey: () => crypto.randomUUID(),
      allowAbandonUnconfirmed: false,
      onPrepareInput: row => {
        assertCurrent()
        if (view.hasUnconfirmedSave || [...dispatched].some(key => !confirmed.has(key))) throw Error('请先核验原审批命令')
        if (!['submit', 'back', 'forceBack', 'toCreator', 'revoke'].includes(String(row['action']))
          || !String(row['flowObjectId'] ?? '').trim() || !String(row['stepId'] ?? '').trim()) throw Error('审批命令缺少正式动作或目标')
        if (inputFields.some(field => row[field] !== undefined && typeof row[field] !== 'string')) throw Error('审批命令文本输入类型不符')
        nodeSignature(row['nextNode'])
        const key = row[view.primaryKey]
        if (typeof key !== 'string' || key.length === 0 || captures.has(key)) throw Error('审批命令身份重复')
        const assertTarget = this.input.captureTarget(row)
        assertTarget()
        captures.set(key, {row: Object.freeze(structuredClone(row)), assertTarget})
      },
      submit: async row => {
        assertCurrent()
        assertCapture(row)
        const key = row[view.primaryKey]
        const receipt = confirmed.get(key)
        if (receipt) return {...receipt}
        if ([...dispatched].some(other => other !== key && !confirmed.has(other))) {
          throw Error('原审批命令在途或结果未知；本命令未发送')
        }
        if (dispatched.has(key)) throw new FlowRunCommandUnknown('原审批命令已派发；禁止重复发送')
        dispatched.add(key)
        try {
          await dispatch(Object.freeze({...row}))
          assertCurrent()
          assertCapture(row)
          const accepted = {...row}
          confirmed.set(key, accepted)
          return {...accepted}
        } catch (cause) {
          throw new FlowRunCommandUnknown('审批结果未知；保留原命令，禁止重复发送', {cause})
        }
      },
      verify: row => Promise.resolve().then(() => {
        assertCurrent()
        assertCapture(row)
        throw new FlowRunCommandUnknown('服务尚无原审批命令权威核验合同；不重复发送')
      }),
      isUnconfirmed: error => error instanceof FlowRunCommandUnknown,
    }
  }
}
