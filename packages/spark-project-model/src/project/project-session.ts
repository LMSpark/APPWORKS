/**
 * @module @spark-appworks/spark-project-model:project/project-session
 * 职责：提供项目模型层 project-session 能力，围绕 ProjectSessionState、ProjectSessionOwner、ProjectSession 处理导航、页面文件、配置内容、工作区或远端 IO 契约。
 * 边界：只表达项目/页面配置领域模型，不直接渲染组件，也不绕过 pageDesign 四文件链路。
 * AI用途：规划导航、读写 page files 或理解 ProjectModel/ProjectWorkspace 行为时，用本模块定位 project/project-session。
 */
import type { BlueprintNodeDraft } from '../blueprint/project-blueprint-edit'
import type { ProjectBlueprintNode } from '../blueprint/project-blueprint-node'
import type { ConfigPageNode } from '../page/config-page'
import type { ProjectBlueprintDirtyScope } from './project-types'

/** Project Session State 的运行状态。 */
export type ProjectSessionState = {
    /** selected Node Id 标识。 */
selectedNodeId: string | null
    /** active Page Id 标识。 */
activePageId: string | null
    /** navigation Dirty 字段。 */
blueprintDirty: boolean
    /** navigation Dirty Scope 字段。 */
blueprintDirtyScope: ProjectBlueprintDirtyScope | null
}

type ProjectSessionOwner = {
  /** 按 nodeId 在导航树中查找项目节点；未找到返回 null */
  findNodeById(nodeId: string): ProjectBlueprintNode | null
  /** 按 pageId 查找已加载的配置页节点；仅返回已 hydrate 的 ConfigPageNode，未找到返回 null */
  findConfigPageByPageId(pageId: string): ConfigPageNode | null
}

/**
 * ProjectModel 持有的设计过程态：选中、活动页、dirty 与导航草稿（不落盘）。
 */
export class ProjectSession {
  private readonly state: ProjectSessionState = {
    selectedNodeId: null,
    activePageId: null,
    blueprintDirty: false,
    blueprintDirtyScope: null,
  }

  private blueprintDraftValue: BlueprintNodeDraft | null = null

constructor(private readonly owner: ProjectSessionOwner) {}

  get session(): Readonly<ProjectSessionState> {
    return this.state
  }

  get blueprintDraft(): BlueprintNodeDraft | null {
    return this.blueprintDraftValue
  }

  get isBlueprintEditing(): boolean {
    return this.blueprintDraftValue !== null
  }

  get blueprintDirty(): boolean {
    return this.state.blueprintDirty
  }

    /** 设置 Navigation Draft。 */
setBlueprintDraft(draft: BlueprintNodeDraft | null): void {
    this.blueprintDraftValue = draft
  }

beginBlueprintDraft(draft: BlueprintNodeDraft): BlueprintNodeDraft {
    this.blueprintDraftValue = draft
    return this.blueprintDraftValue
  }

discardBlueprintDraft(): void {
    this.blueprintDraftValue = null
    this.markBlueprintClean()
  }

markBlueprintDirty(scope: ProjectBlueprintDirtyScope): void {
    this.state.blueprintDirty = true
    this.state.blueprintDirtyScope = scope === 'root'
      ? 'root'
      : (this.state.blueprintDirtyScope ?? 'node')
  }

markBlueprintClean(): void {
    this.state.blueprintDirty = false
    this.state.blueprintDirtyScope = null
    this.blueprintDraftValue = null
  }

    /** set Selected Node Id 标识。 */
setSelectedNodeId(
    nodeId: string | null | undefined,
    options?: { silentIfMissing?: boolean },
  ): void {
    const normalized = nodeId?.trim() ?? ''
    if (!normalized) {
      this.state.selectedNodeId = null
      return
    }
    const exists = this.owner.findNodeById(normalized)
    if (!exists) {
      if (options?.silentIfMissing === true) {
        this.state.selectedNodeId = null
        return
      }
      throw new Error(`项目节点未找到: ${normalized}`)
    }
    this.state.selectedNodeId = normalized
  }

    /** set Active Page Id 标识。 */
setActivePageId(pageId: string | null | undefined): void {
    const normalized = pageId?.trim() ?? ''
    if (!normalized) {
      this.state.activePageId = null
      return
    }
    const existing = this.owner.findConfigPageByPageId(normalized)
    if (!existing) {
      throw new Error(`配置页面节点未找到: ${normalized}`)
    }
    this.state.activePageId = normalized
  }

syncWithModel(): void {
    const selectedNodeId = this.state.selectedNodeId
    if (selectedNodeId && !this.owner.findNodeById(selectedNodeId)) {
      this.state.selectedNodeId = null
    }
    const activePageId = this.state.activePageId
    if (activePageId && !this.owner.findConfigPageByPageId(activePageId)) {
      this.state.activePageId = null
    }
  }
}
