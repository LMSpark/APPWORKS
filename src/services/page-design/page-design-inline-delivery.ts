/**
 * @module app:services/page-design/page-design-inline-delivery
 * 职责：交付活跃 pageDesign runner 本轮的页面文件和场景定义 DataView 变更。
 * 边界：只读取当前 ProjectWorkspace 投影并提交正式 DataView 回执，不创建 AI run owner。
 * AI用途：理解 pageDesign inline runner 的提交结果与待保存状态。
 */
import type { PageToolFileName, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import { PAGE_TOOL_FILE_NAMES, ScenarioDefinitionRecords } from '@spark-appworks/spark-project-model'
import type {DataSet} from '@spark-appworks/spark-data'
import {
  toError,
  type AiDeliveryArtifact,
  type AiDeliveryMode,
  type AiDeliveryPort,
} from '@/services/ai/ai-delivery-port'
import {
  isPageDesignDataSetOnlyMode,
  type PageDesignAllowedOperations,
} from '@/services/page-design/page-design-gates'

// --- delivery ---

/** pageDesign Agent Run 落盘时携带的 editor 与 pageId 上下文。 */
export type PageDesignDeliveryContext = Readonly<{
  /** 页面设计工作区编辑器。 */
  editor: ProjectWorkspace
  /** 当前页面节点 id。 */
  pageId: string
  requestId?: string
  scenarioId?: string
  savePageFile?: (pageId:string,name:PageToolFileName,text:string)=>Promise<void>
}>

/** Create Page Design Delivery Port Options 的调用配置。 */
export type CreatePageDesignDeliveryPortOptions = Readonly<{
  /** 交付模式（manual 或 auto）。 */
  mode: AiDeliveryMode
  /** 是否执行实际落盘保存。 */
  shouldSave: boolean
  /** 限定保存的文件名列表（省略则保存全部 dirty 文件）。 */
  saveFileNames?: readonly PageToolFileName[]
  allowedOperations?: PageDesignAllowedOperations
  savePageFile?: (pageId:string,name:PageToolFileName,text:string)=>Promise<void>
}>

/** 本次交付的明确文件范围及允许操作；省略范围与非法空范围语义不同。 */
type PageDesignDeliverySelection = Pick<CreatePageDesignDeliveryPortOptions, 'saveFileNames' | 'allowedOperations'>
/** 内联交付设置；沿用已确定的目标范围并显式决定是否实际保存。 */
type PageDesignInlineDeliveryOptions = PageDesignDeliverySelection & Readonly<{ autoSave: boolean; savePageFile?: (pageId:string,name:PageToolFileName,text:string)=>Promise<void> }>

export function createPageDesignInlineDeliveryPort(options: PageDesignInlineDeliveryOptions): AiDeliveryPort<PageDesignDeliveryContext> {
  const mode: AiDeliveryMode = options.autoSave ? 'auto' : 'manual'
  return createPageDesignDeliveryPort({
    mode,
    shouldSave: options.autoSave,
    ...(options.saveFileNames === undefined ? {} : { saveFileNames: options.saveFileNames }),
    ...(options.allowedOperations === undefined ? {} : { allowedOperations: options.allowedOperations }),
    ...(options.savePageFile === undefined ? {} : {savePageFile:options.savePageFile}),
  })
}

function createPageDesignDeliveryPort(
  options: CreatePageDesignDeliveryPortOptions,
): AiDeliveryPort<PageDesignDeliveryContext> {
  return {
    mode: options.mode,
    async save(context) {
      if (context.editor.project.getActivePage()?.pageId !== context.pageId) throw new Error('PAGE_DESIGN_REQUEST_MISMATCH: 交付页面已改变')
      const dirtyFileNames = readDirtyPageFileNames(context.editor)
      const selectedNames = resolveDeliveryTargetFileNames(dirtyFileNames, options.saveFileNames)
      const targetNames = isPageDesignDataSetOnlyMode(options.allowedOperations) ? [] : selectedNames
      const artifactNames = options.saveFileNames ?? dirtyFileNames
      const scenarioId = context.scenarioId
      const scene = scenarioId === undefined ? null : context.editor.getScenarioDefinitions(scenarioId)
      if (scenarioId !== undefined && scene === null) throw new Error('PAGE_DESIGN_SCENARIO_MISSING: 场景尚未加载')
      const sceneViews = scene === null || scenarioId === undefined ? [] : pendingDefinitionViews(scene, scenarioId)
      const shouldSaveScene = options.allowedOperations?.dataSet !== false && sceneViews.length > 0
      const sceneArtifact: AiDeliveryArtifact[] = scene === null || scenarioId === undefined ? [] : [{ kind: 'scenario-view', name: scenarioId, status: sceneViews.length ? 'dirty' : 'skipped' }]
      if (!options.shouldSave || (targetNames.length === 0 && !shouldSaveScene)) {
        return {
          mode: options.mode,
          status: 'skipped',
          artifacts: [...createFilteredPageFileArtifacts({ artifactNames, dirtyFileNames, shouldSave: options.shouldSave }), ...sceneArtifact],
        }
      }
      const savePageFile=context.savePageFile??options.savePageFile
      if(targetNames.length>0&&savePageFile===undefined)throw new Error('PAGE_TOOL_FILE_SAVE_DATAVIEW_REQUIRED: AI autoSave 缺少当前活跃 DataView owner')
      const page=context.editor.project.getActivePage()
      if(targetNames.length>0&&(page?.pageId!==context.pageId||page.isLoaded!==true))throw new Error('PAGE_DESIGN_REQUEST_MISMATCH: AI交付页面未就绪')
      const saves:Array<Promise<void>>=[]
      if(targetNames.length>0){
        if(savePageFile===undefined||page===null)throw new Error('PAGE_TOOL_FILE_SAVE_DATAVIEW_REQUIRED: AI autoSave owner或页面缺失')
        for(const name of targetNames)saves.push(savePageFile(context.pageId,name,page.getFileText(name)))
      }
      if (scene && shouldSaveScene) saves.push(scene.saveChanges({views: sceneViews}).then(result => {
        if (!result.success) throw result.error ?? new Error(result.message ?? '场景定义保存失败')
      }))
      const results = await Promise.allSettled(saves)
      const errors = results.flatMap(result => result.status === 'rejected' ? [toError(result.reason).message] : [])
      const remainingFiles = new Set(context.editor.project.findPageTool(context.pageId)?.getDirtyFileNames() ?? [])
      const scenePending = scene !== null && scenarioId !== undefined && pendingDefinitionViews(scene, scenarioId).length > 0
      const artifacts: AiDeliveryArtifact[] = [...targetNames.map((name, index): AiDeliveryArtifact => ({kind: 'page-file', name,
        status: results[index]?.status === 'fulfilled' && !remainingFiles.has(name) ? 'saved' : 'dirty'})),
      ...sceneArtifact.map(artifact => ({...artifact, status: shouldSaveScene ? scenePending || results[targetNames.length]?.status !== 'fulfilled'
        ? 'dirty' as const : 'saved' as const : artifact.status}))]
      const remaining: string[] = targetNames.filter((name, index) => results[index]?.status === 'fulfilled' && remainingFiles.has(name))
      if (shouldSaveScene && results[targetNames.length]?.status === 'fulfilled' && scenePending && scenarioId) remaining.push(scenarioId)
      if (remaining.length) errors.push(`本轮提交已确认，仍有修改待保存：${remaining.join('、')}`)
      return {
        mode: options.mode,
        status: errors.length === 0 ? 'saved' : 'failed',
        artifacts,
        ...(errors.length === 0 ? {} : { message: errors.join('\n') }),
      }
    },
    trace() {
      return Promise.resolve()
    },
    rollback(context, error) {
      const dirtyFileNames = readDirtyPageFileNames(context.editor)
      const artifactNames = options.saveFileNames ?? dirtyFileNames
      const scenarioId = context.scenarioId
      const scene = scenarioId === undefined ? null : context.editor.getScenarioDefinitions(scenarioId)
      const sceneArtifacts: AiDeliveryArtifact[] = scene === null || scenarioId === undefined ? [] : [{ kind: 'scenario-view', name: scenarioId, status: pendingDefinitionViews(scene, scenarioId).length ? 'dirty' : 'skipped' }]
      return Promise.resolve({
        mode: options.mode,
        status: 'skipped',
        artifacts: [...createFilteredPageFileArtifacts({ artifactNames, dirtyFileNames, shouldSave: false }), ...sceneArtifacts],
        message: error.message,
      })
    },
  }
}

/** Only already edited definition views for this target participate in delivery; other metadata drafts remain separate. */
function pendingDefinitionViews(dataSet: DataSet, target: string): Array<{tableName: string; viewId: string}> {
  return Object.entries(ScenarioDefinitionRecords.resources).flatMap(([name, resourceId]) => {
    const table = dataSet.getTable(name)
    if (table?.resourceType !== 'file' || table.resourceId !== resourceId) throw new Error(`PAGE_DESIGN_SCENARIO_IDENTITY: 缺少正式定义资源 ${name}`)
    return table.viewList.filter(view => view.queryContext['dataSpaceId'] === target && (view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()))
      .map(view => ({tableName: view.tableName, viewId: view.viewId}))
  })
}

function resolveDeliveryTargetFileNames(
  dirtyFileNames: readonly PageToolFileName[],
  saveFileNames: readonly PageToolFileName[] | undefined,
): PageToolFileName[] {
  if (saveFileNames === undefined) return [...dirtyFileNames]
  if (!Array.isArray(saveFileNames) || saveFileNames.length === 0
    || saveFileNames.some((name: unknown) => !PAGE_TOOL_FILE_NAMES.some(file => file === name))) {
    throw new Error('PAGE_DESIGN_SAVE_SCOPE_INVALID: 保存范围必须为非空有效文件名数组')
  }
  return dirtyFileNames.filter(name => saveFileNames.includes(name))
}

type CreateFilteredPageFileArtifactsOptions = Readonly<{
  artifactNames: readonly PageToolFileName[]
  dirtyFileNames: readonly PageToolFileName[]
  shouldSave: boolean
}>

function createFilteredPageFileArtifacts(
  options: CreateFilteredPageFileArtifactsOptions,
): readonly AiDeliveryArtifact[] {
  return options.artifactNames.map((name) => {
    const isDirty = options.dirtyFileNames.includes(name)
    if (!options.shouldSave) {
      return { kind: 'page-file', name, status: isDirty ? 'dirty' : 'skipped' }
    }
    return { kind: 'page-file', name, status: 'skipped' }
  })
}

function readDirtyPageFileNames(editor: ProjectWorkspace): PageToolFileName[] {
  return [...new Set(editor.project.readDirtyProjection().dirtyFiles)]
}
