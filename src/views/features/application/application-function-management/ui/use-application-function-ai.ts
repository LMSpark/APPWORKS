/**
 * @module app:views/features/application/application-function-management/ui/use-application-function-ai
 * 职责：项目蓝图页的两条 AI 流程：选中位置的下一级节点策划（生成→严格校验→预览→确认后逐个经 owner 新增）与当前节点表单回填（生成→校验→预览→确认后写入 DataView 编辑覆盖，不保存）。
 * 边界：草稿经同 DataSet 的 AiTurnDraftRunner 取得；写入只走 useDevState/owner 的 DataView 入口。取消、切换节点或上下文时作废进行中的请求与预览，迟到结果丢弃，不写任何数据。
 * AI用途：修改蓝图 AI 交互时，以本 composable 的代次与上下文校验为唯一防串数据入口。
 */
import {computed, ref, shallowRef, watch, type Ref} from 'vue'
import type {BlueprintTreeContext} from './use-application-function-page'
import {
  BLUEPRINT_AI_FORM_LABELS, BLUEPRINT_AI_REJECTED, blueprintAiDraftFields, blueprintConTypeToAiKind, buildBlueprintFormAiPrompt,
  buildBlueprintTreeAiPrompt, parseBlueprintAiForm, parseBlueprintAiRows, readBlueprintCurrentText, type BlueprintAiDraft,
} from './application-function-page-contract'

type TreeAiPreview = Readonly<{contextKey: string; parentNodeId: string | null; parentLabel: string; rows: readonly BlueprintAiDraft[]}>
type FormAiPreview = Readonly<{contextKey: string; nodeId: string; draft: BlueprintAiDraft}>

/** 页面向 AI 流程提供的上下文与写入入口。 */
export type ApplicationFunctionAiInput = Readonly<{
  /** 当前有效蓝图树上下文；身份变化即作废 AI 结果。 */
  context: () => BlueprintTreeContext | undefined
  /** 当前选中节点；空串表示应用根位置。 */
  selectedNodeId: Readonly<Ref<string>>
  /** 上下文仍是当前树且选中节点仍为 nodeId（空串为根位置）。 */
  isLive: (context: BlueprintTreeContext, nodeId: string) => boolean
  /** 当前应用显示名，进入提示词。 */
  applicationLabel: () => string
  /** 取得当前 DataSet 的草稿运行器（同一 DataSet 复用）。 */
  createRunner: (context: BlueprintTreeContext) => Readonly<{run: (message: string, signal?: AbortSignal) => Promise<string>}>
  /** 经 owner 在父节点下新增一个带内容字段的模块；父为 null 表示根层。 */
  createNode: (parentNodeId: string | null, fields: Readonly<Record<string, string>>) => Promise<string>
  /** 新增完成后展开父节点。 */
  expand: (nodeId: string) => void
  /** 通知标准组件 DataView 编辑状态已变化。 */
  notifyChanged: () => void
  /** 页面输入 DataView 当前值（requirement / versionDescription）。 */
  readInput: (field: string) => string
  /** 清空页面输入 DataView 的指定字段。 */
  resetInput: (field: string) => void
  error: Ref<string>
  notice: Ref<string>
}>

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** 蓝图页 AI 状态与动作。 */
export function useApplicationFunctionAi(input: ApplicationFunctionAiInput) {
  const treeAiOpen = ref(false)
  const treeAiRequirement = computed(() => input.readInput('requirement'))
  const treeAiPreview = shallowRef<TreeAiPreview>()
  const treeAiCreated = ref(0)
  const treeAiConfirming = ref(false)
  const formAiPreview = shallowRef<FormAiPreview>()
  const aiGenerating = ref(false)
  let revision = 0
  let controller: AbortController | undefined

  const formAiPreviewItems = computed(() => {
    const draft = formAiPreview.value?.draft
    return draft ? BLUEPRINT_AI_FORM_LABELS.map(([field, label]) => ({field, label, value: draft[field]})) : []
  })

  function nodeLabel(context: BlueprintTreeContext, nodeId: string): string {
    const row = context.owner.view.rows.find(candidate => String(candidate['rowid'] ?? '') === nodeId)
    const title = row?.['FunName'] ?? row?.['name']
    return typeof title === 'string' ? title : nodeId
  }

  /** 作废进行中的生成与全部预览（不关闭需求输入框）。 */
  function invalidate(): void {
    revision++
    controller?.abort()
    controller = undefined
    aiGenerating.value = false
    treeAiPreview.value = undefined
    treeAiCreated.value = 0
    formAiPreview.value = undefined
  }

  /** 作废进行中的生成与全部预览并关闭输入框；确认写入中的树草案在当前一项完成后停止。 */
  function cancelAi(): void {
    invalidate()
    treeAiOpen.value = false
  }

  async function generate(context: BlueprintTreeContext, nodeId: string, prompt: string): Promise<string | undefined> {
    invalidate()
    const request = revision
    const current = new AbortController()
    controller = current
    aiGenerating.value = true
    try {
      const text = await input.createRunner(context).run(prompt, current.signal)
      return request === revision && input.isLive(context, nodeId) ? text : undefined
    } catch (cause) {
      if (request === revision && input.isLive(context, nodeId)) input.error.value = `AI生成失败：${describe(cause)}`
      return undefined
    } finally {
      if (request === revision) {
        aiGenerating.value = false
        controller = undefined
      }
    }
  }

  function openTreeAi(): void {
    if (!input.context()) return
    cancelAi()
    input.resetInput('requirement')
    treeAiOpen.value = true
  }

  async function generateTreeAi(): Promise<void> {
    const context = input.context()
    const requirement = treeAiRequirement.value
    if (!context || !requirement.trim() || aiGenerating.value) return
    const nodeId = input.selectedNodeId.value
    const parentLabel = nodeId ? nodeLabel(context, nodeId) : ''
    let prompt: string
    try {
      prompt = buildBlueprintTreeAiPrompt({applicationLabel: input.applicationLabel(), parentLabel, requirement})
    } catch (cause) {
      input.error.value = describe(cause)
      return
    }
    const text = await generate(context, nodeId, prompt)
    if (text === undefined) return
    try {
      treeAiPreview.value = {contextKey: context.key, parentNodeId: nodeId || null,
        parentLabel: parentLabel || input.applicationLabel() || '应用根层', rows: parseBlueprintAiRows(text)}
      treeAiOpen.value = false
      treeAiCreated.value = 0
      input.error.value = ''
    } catch (cause) {
      input.error.value = `${BLUEPRINT_AI_REJECTED}：${describe(cause)}`
    }
  }

  /** 逐个经 owner 新增；失败停在当前项，再次确认从该项继续（owner 存在待核验新增时先核验原提交）。 */
  async function confirmTreeAi(): Promise<void> {
    const preview = treeAiPreview.value
    const context = input.context()
    if (!preview || !context || treeAiConfirming.value) return
    if (context.key !== preview.contextKey || (input.selectedNodeId.value || null) !== preview.parentNodeId) {
      cancelAi()
      input.error.value = '蓝图上下文或选中节点已变化，AI 草案未写入'
      return
    }
    const request = revision
    treeAiConfirming.value = true
    try {
      while (treeAiCreated.value < preview.rows.length) {
        const draft = preview.rows[treeAiCreated.value]
        if (!draft) break
        await input.createNode(preview.parentNodeId, blueprintAiDraftFields(draft))
        if (request !== revision) return
        treeAiCreated.value++
        if (!input.isLive(context, preview.parentNodeId ?? '')) {
          input.error.value = `蓝图上下文已变化，AI 草案已写入 ${treeAiCreated.value}/${preview.rows.length} 个节点后停止`
          return
        }
      }
      if (preview.parentNodeId !== null) input.expand(preview.parentNodeId)
      input.notice.value = `已写入 ${preview.rows.length} 个下一级蓝图节点`
      input.error.value = ''
      treeAiPreview.value = undefined
      treeAiCreated.value = 0
    } catch (cause) {
      if (request === revision) {
        input.error.value = `AI 草案已写入 ${treeAiCreated.value}/${preview.rows.length} 个节点，其余未写入：${describe(cause)}；可再次确认继续`
      }
    } finally {
      treeAiConfirming.value = false
    }
  }

  async function generateFormAi(): Promise<void> {
    const context = input.context()
    const nodeId = input.selectedNodeId.value
    if (!context || !nodeId || aiGenerating.value) return
    const owner = context.owner
    const read = (field: string) => readBlueprintCurrentText(owner, field)
    const prompt = buildBlueprintFormAiPrompt({applicationLabel: input.applicationLabel(), nodeLabel: nodeLabel(context, nodeId), current: {
      navigationTitle: read('FunName'), capabilityName: read('name'), kind: blueprintConTypeToAiKind(read('conType')),
      deliveryStatus: read('status'), description: read('memo'),
    }})
    const text = await generate(context, nodeId, prompt)
    if (text === undefined) return
    try {
      formAiPreview.value = {contextKey: context.key, nodeId, draft: parseBlueprintAiForm(text)}
      input.error.value = ''
    } catch (cause) {
      input.error.value = `${BLUEPRINT_AI_REJECTED}：${describe(cause)}`
    }
  }

  /** 确认后把草案写入当前行 DataView 编辑覆盖；不保存，由用户显式保存。 */
  function confirmFormAi(): void {
    const preview = formAiPreview.value
    const context = input.context()
    formAiPreview.value = undefined
    if (!preview || !context) return
    if (!input.isLive(context, preview.nodeId) || context.key !== preview.contextKey) {
      input.error.value = '蓝图上下文或选中节点已变化，AI 回填未写入'
      return
    }
    const owner = context.owner
    const fields = Object.entries(blueprintAiDraftFields(preview.draft))
    // 全部字段先经 owner 同一写入判定（正式输出、行内可读、编辑动作、字段写权限），任一拒绝则不写任何字段。
    const denied = fields.find(([field]) => !owner.canWrite(field))
    if (denied) {
      input.error.value = `当前 DataView 不允许写入字段 ${denied[0]}，AI 回填未写入`
      return
    }
    try {
      for (const [field, value] of fields) owner.update(field, value)
      input.error.value = ''
      input.notice.value = 'AI内容已回填到表单'
    } catch (cause) {
      input.error.value = `AI 回填失败：${describe(cause)}`
    } finally {
      input.notifyChanged()
    }
  }

  watch(() => [input.selectedNodeId.value, input.context()?.key], () => {
    if (!treeAiConfirming.value) cancelAi()
  })

  return {
    treeAiOpen,
    treeAiRequirement,
    treeAiPreview,
    treeAiCreated,
    treeAiConfirming,
    formAiPreview,
    formAiPreviewItems,
    aiGenerating,
    openTreeAi,
    generateTreeAi,
    confirmTreeAi,
    generateFormAi,
    confirmFormAi,
    cancelAi,
  }
}
