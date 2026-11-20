/**
 * @module @spark-appworks/spark-ai:class-model/recovery/class-model-failure-mode-recovery
 * 职责：维护 @spark-appworks/spark-ai 中 class-model/recovery/class-model-failure-mode-recovery 的 ClassModelFailureModeRecoveryCommand、ClassModelFailureModeRecoveryContext语义。
 * 边界：只服务 spark-ai 包内部的 Agent/DtsTypeDeclarationModel 能力，不直接耦合应用页面或 Vue 组件。
 * AI用途：定位 spark-ai 公共 API、运行时协议或知识索引字段时，用本模块作为语义入口。
 */
/**
 * DtsTypeDeclarationModel recovery：从构建期动作失败描述派生 RECOVERY_HINT。
 *
 * DtsTypeDeclarationModel 是知识索引（model_*_guide）；连通性在构建期 fail-fast，无 diagnostics 旁路。
 * recovery 只读动作失败描述，不遍历 DtsTypeDeclarationModel 图，不在 app 层补链。
 */
import type {
  AiApiActionFailureMode,
  AiApiObjectMetadata,
  AiRuntimeApiMetadataJson,
} from '../metadata'

/** Class Model Failure Mode Recovery Command 的命令参数。 */
export type ClassModelFailureModeRecoveryCommand = Readonly<{
  /** 触发恢复的动作调用返回结果，code 用于匹配 failureMode.code，msg 用于 when 条件文本匹配 */
  callResult: Readonly<{
    code: string
    msg: string
  }>
  /** 模块实例 ID（如页面 ID），用于将 fix 模板中的 <pageId> 占位符替换为实际值 */
  moduleInstanceId?: string
}>

/** Class Model Failure Mode Recovery Context 的运行上下文。 */
export type ClassModelFailureModeRecoveryContext = Readonly<{
  /** API 对象的 kind 标识，用于定位失败动作所属的 ClassModel API 类别 */
  kind: string
  /** 失败动作名称，用于在 recovery hint 中反查 model_action_guide */
  actionName: string
  /** 匹配到的失败模式定义，含 code/when/fix 等字段，驱动 hint 生成 */
  mode: AiApiActionFailureMode
}>

export function collectClassModelFailureModeRecoveryHints(
  metadata: AiRuntimeApiMetadataJson,
  command: ClassModelFailureModeRecoveryCommand,
): readonly string[] {
  const code = command.callResult.code
  const candidates = collectFailureModeCandidates(metadata, code)
  if (candidates.length === 0) return []

  const matched = candidates.filter(candidate => failureModeMatchesFailure(candidate.mode, command))
  const selected = matched.length > 0 ? matched : (candidates.length === 1 ? candidates : [])

  const hints: string[] = []
  const seen = new Set<string>()
  for (const candidate of selected) {
    const hint = formatFailureModeRecoveryHint(candidate, command)
    if (seen.has(hint)) continue
    seen.add(hint)
    hints.push(hint)
  }
  return hints
}

function collectFailureModeCandidates(
  metadata: AiRuntimeApiMetadataJson,
  code: string,
): readonly ClassModelFailureModeRecoveryContext[] {
  const out: ClassModelFailureModeRecoveryContext[] = []
  for (const api of collectModuleApis(metadata)) {
    for (const action of api.actions) {
      for (const mode of action.failureModes ?? []) {
        if (mode.code !== code) continue
        out.push({ kind: api.kind, actionName: action.name, mode })
      }
    }
  }
  return out
}

function collectModuleApis(metadata: AiRuntimeApiMetadataJson): readonly AiApiObjectMetadata[] {
  const apis: AiApiObjectMetadata[] = [metadata.rootApi]
  if (metadata.apiRegistry !== undefined) {
    for (const api of Object.values(metadata.apiRegistry)) {
      apis.push(api)
    }
  }
  return apis
}

function failureModeMatchesFailure(
  mode: AiApiActionFailureMode,
  command: ClassModelFailureModeRecoveryCommand,
): boolean {
  const when = mode.when.trim()
  if (when.length === 0) return true
  return whenContextMatchesMsg(when, command.callResult.msg)
}

function whenContextMatchesMsg(when: string, msg: string): boolean {
  const msgLower = msg.toLowerCase()
  const englishTokens = when.match(/[a-zA-Z_][a-zA-Z0-9_.]*/g) ?? []
  for (const token of englishTokens) {
    if (msgLower.includes(token.toLowerCase())) return true
  }
  const fragments = when.split(/[\s，。、；=>]+/).filter(fragment => fragment.length >= 2)
  for (const fragment of fragments) {
    if (msg.includes(fragment)) return true
  }
  return false
}

function formatFailureModeRecoveryHint(
  candidate: ClassModelFailureModeRecoveryContext,
  command: ClassModelFailureModeRecoveryCommand,
): string {
  let fix = interpolateFailureModeFix(candidate.mode.fix, command)
  const lookup = `model_action_guide({ kind: "${candidate.kind}", actionName: "${candidate.actionName}" })`
  if (!fix.includes('model_action_guide')) {
    fix = `${fix} 反查指南：${lookup}。`
  }
  return fix
}

function interpolateFailureModeFix(
  fix: string,
  command: ClassModelFailureModeRecoveryCommand,
): string {
  const pageId = command.moduleInstanceId?.trim()
  if (pageId === undefined || pageId.length === 0) return fix
  return fix.replaceAll('<pageId>', pageId)
}


