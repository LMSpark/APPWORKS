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
// Owner handles only: no second command rows, drafts, permissions or receipts.
const preflights = new WeakMap<DataView, Readonly<{
  assertAvailable: (row: Readonly<DataRow>) => void
  registerInputProof: (key: string, assertInput: () => void) => () => void
}>>()
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

  /** 在原绑定owner校验当次输入；不创建命令、改变查询或执行HTTP。宿主须先经原view.refresh激活owner。 */
  public static assertCanPrepare(view: DataView, input: Readonly<DataRow>): void {
    const owner = preflights.get(view)
    if (!owner) throw Error('审批命令缺少原绑定预检owner')
    owner.assertAvailable(input)
  }

  /** 将本次参数校验函数交给原命令owner，在准备和实际派发前复核；不存参数副本。返回清理函数仅释放未派发的本次命令，未知命令保留。 */
  public static registerInputProof(view: DataView, key: string, assertInput: () => void): () => void {
    const owner = preflights.get(view)
    if (!owner) throw Error('审批命令缺少原绑定预检owner')
    return owner.registerInputProof(key, assertInput)
  }

  public binding(): BindCommandSubmitOptions {
    const {view, guard, dispatch} = this.input
    const captures = new Map<unknown, Readonly<{row: Readonly<DataRow>; assertTarget: () => void; assertInput?: () => void}>>()
    const inputProofs = new Map<string, () => void>()
    const dispatched = new Set<unknown>()
    const confirmed = new Map<unknown, DataRow>()
    const assertCapture = (row: Readonly<DataRow>) => {
      const captured = captures.get(row[view.primaryKey])
      if (!captured || [...inputFields, 'isReturn'].some(field => captured.row[field] !== row[field]) || nodeSignature(captured.row['nextNode']) !== nodeSignature(row['nextNode'])) {
        throw Error('审批命令与原捕获目标不符')
      }
      captured.assertTarget()
      captured.assertInput?.()
    }
    const assertCurrent = () => {
      guard()
      if (view.destroyed || view.dataSet?.destroyed || view.dataTable?.resourceType !== 'command'
        || view.dataTable.resourceId !== 'workflow:approval') throw Error('审批命令实例已失效')
      preflights.set(view, {assertAvailable, registerInputProof})
    }
    const assertAvailable = (row: Readonly<DataRow>) => {
      assertCurrent()
      if (view.hasUnconfirmedSave || [...dispatched].some(key => !confirmed.has(key))) throw Error('请先核验原审批命令')
      if (!['submit', 'back', 'forceBack', 'toCreator', 'revoke'].includes(String(row['action']))
        || !String(row['flowObjectId'] ?? '').trim() || !String(row['stepId'] ?? '').trim()) throw Error('审批命令缺少正式动作或目标')
      if (inputFields.some(field => row[field] !== undefined && typeof row[field] !== 'string')) throw Error('审批命令文本输入类型不符')
      if (row['isReturn'] !== undefined && typeof row['isReturn'] !== 'boolean') throw Error('审批返回标志须为布尔值')
      nodeSignature(row['nextNode'])
      const assertTarget = this.input.captureTarget(row)
      assertTarget()
      for (const [confirmedKey, receipt] of confirmed) {
        if (receipt['action'] !== row['action'] || receipt['flowObjectId'] !== row['flowObjectId'] || receipt['stepId'] !== row['stepId']) continue
        const original = captures.get(confirmedKey)
        if (!original) throw Error('已确认审批命令缺少原目标证明')
        let originalCurrent = true
        try {original.assertTarget()} catch {originalCurrent = false}
        if (originalCurrent) throw Error('本次正式查询的审批动作已确认，请重新查询目标状态后办理')
      }
      return assertTarget
    }
    const registerInputProof = (key: string, assertInput: () => void) => {
      assertCurrent(); assertInput()
      if (!key.trim() || captures.has(key) || inputProofs.has(key)) throw Error('审批参数证明缺少唯一命令身份')
      inputProofs.set(key, assertInput)
      return () => {
        inputProofs.delete(key)
        if (!dispatched.has(key) && !view.destroyed && !view.hasUnconfirmedSave) {
          view.discardEditingRows([key]); view.discardPendingChanges([key]); captures.delete(key)
        }
      }
    }
    return {
      resource: {resourceType: 'command', resourceId: 'workflow:approval'},
      guard: assertCurrent,
      inputFields: [...inputFields, 'isReturn', 'nextNode'],
      createKey: () => crypto.randomUUID(),
      allowAbandonUnconfirmed: false,
      onPrepareInput: row => {
        const assertTarget = assertAvailable(row)
        const key = row[view.primaryKey]
        if (typeof key !== 'string' || key.length === 0 || captures.has(key)) throw Error('审批命令身份重复')
        const assertInput = inputProofs.get(key)
        assertInput?.()
        captures.set(key, {row: Object.freeze(structuredClone(row)), assertTarget, ...(assertInput ? {assertInput} : {})})
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
