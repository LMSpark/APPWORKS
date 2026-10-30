/**
 * @module app:services/project-planning-inline-delivery
 * 职责：向活跃 projectPlanning runner 报告本轮 Base_NavigationInfo DataView 提交结果。
 * 边界：只核对 captured DevSystem workspace 的蓝图 DataView 回执，不创建第二保存入口。
 * AI用途：理解 projectPlanning inline runner 的提交结果和仍待保存状态。
 */
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type {AiDeliveryArtifact,AiDeliveryMode,AiDeliveryPort} from '@/services/ai/ai-delivery-port'

// --- delivery ---

/** projectPlanning inline run 落盘时携带的 editor 与蓝图保存策略。 */
export type ProjectPlanningDeliveryContext = Readonly<{
  /** 本轮 captured ProjectWorkspace，持有当前项目蓝图和配置页模型。 */
  editor: ProjectWorkspace
  /** Agent Run 成功结束后是否自动保存蓝图变更；false 时仅标记 dirty 不落盘。 */
  saveBlueprintAfterRun: boolean
  /** True only after a live DataView command returned its accepted receipt and readback. */
  dataViewBlueprintSaved?: boolean
  /** True when the original DataView command still needs explicit Save All recovery. */
  dataViewBlueprintPending?: boolean
  /** A later plan mutation was attempted after this run had already issued its single DataView command. */
  dataViewBlueprintRepeatRejected?: boolean
}>

type CreateProjectPlanningDeliveryPortOptions = Readonly<{
  mode: AiDeliveryMode
  rollbackStatus: 'skipped' | 'rolledBack'
}>

export function createProjectPlanningInlineDeliveryPort(): AiDeliveryPort<ProjectPlanningDeliveryContext> {
  return createProjectPlanningDeliveryPort({
    mode: 'manual',
    rollbackStatus: 'skipped',
  })
}

function createProjectPlanningDeliveryPort(
  options: CreateProjectPlanningDeliveryPortOptions,
): AiDeliveryPort<ProjectPlanningDeliveryContext> {
  return {
    mode: options.mode,
    save(context) {
      if (context.dataViewBlueprintPending === true) {
        return Promise.resolve({
          mode: options.mode,
          status: 'failed',
          artifacts: [createBlueprintArtifact('dirty')],
          message: '项目策划 DataView 命令仍待核验；原命令身份已保留，请沿工作台 Save All 完成回读。',
        })
      }
      if (context.dataViewBlueprintRepeatRejected === true) {
        return Promise.resolve({
          mode: options.mode,
          status: 'failed',
          artifacts: [createBlueprintArtifact(context.dataViewBlueprintSaved === true ? 'saved' : 'dirty')],
          message: context.dataViewBlueprintSaved === true
            ? '本次运行的首个蓝图命令已由 DataView 确认保存；后续计划变更已拒绝，因此本次规划仅部分完成。请保留未提交计划。'
            : '本次运行已发出蓝图 DataView 命令；后续计划变更已拒绝，首个命令未确认保存，请保留计划并核验原命令。',
        })
      }
      if (context.dataViewBlueprintSaved === true) {
        return Promise.resolve({ mode: options.mode, status: 'saved', artifacts: [createBlueprintArtifact('saved')] })
      }
      const blueprintDirty = context.editor.project.blueprintDirty
      if (!context.saveBlueprintAfterRun || !blueprintDirty) {
        return Promise.resolve({
          mode: options.mode,
          status: 'skipped',
          artifacts: blueprintDirty ? [createBlueprintArtifact('skipped')] : [],
        })
      }
      return Promise.resolve({
        mode: options.mode,
        status: 'failed',
        artifacts: [createBlueprintArtifact('dirty')],
        message: '项目策划蓝图没有获准的 Base_NavigationInfo DataView 命令上下文，拒绝经 ProjectWorkspace.saveAll 提交。请保留策划结果并等待 DataView 命令接线。',
      })
    },
    trace() {
      return Promise.resolve()
    },
    rollback(context, error) {
      const blueprintDirty = context.editor.project.blueprintDirty
      return Promise.resolve({
        mode: options.mode,
        status: blueprintDirty ? options.rollbackStatus : 'skipped',
        artifacts: blueprintDirty ? [createBlueprintArtifact(options.rollbackStatus)] : [],
        message: error.message,
      })
    },
  }
}

function createBlueprintArtifact(status: AiDeliveryArtifact['status']): AiDeliveryArtifact {
  return {
    kind: 'project-blueprint',
    name: 'project-blueprint',
    status,
  }
}
