/**
 * @module app:services/page-design/page-design-headless
 * 职责：pageDesign 隔离式 headless ProjectWorkspace 工厂与 registry getter。
 * 边界：只创建/解析 headless editor，不执行 Agent Run 或三文件落盘。
 * AI用途：Agent Run 需要隔离式 editor 时，用本模块获取 ProjectWorkspace。
 */
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  createLowcodeProjectGateways,
  readLowcodePrincipal,
} from '@/lowcode/lowcode-runtime'

/** Page Design Editor Resolve Context 的运行上下文。 */
export type PageDesignEditorResolveContext = {
  /** 需要解析的 headless 编辑器所对应的运行 requestId；用于从 headlessRegistry 中定位已创建的 ProjectWorkspace */
  moduleInstanceId: string
}

export function createHeadlessPageDesignEditor(): ProjectWorkspace {
  const projectId = readLowcodePrincipal()?.applicationId ?? 'homepage'
  return new ProjectWorkspace({
    projectId,
    ...createLowcodeProjectGateways(projectId),
  })
}

export function resolvePageDesignEditor(
  context: PageDesignEditorResolveContext,
  headlessRegistry: ReadonlyMap<string, ProjectWorkspace>,
): ProjectWorkspace {
  const editor = headlessRegistry.get(context.moduleInstanceId)
  if (editor === undefined) {
    throw new Error(`Headless pageDesign editor is not prepared: ${context.moduleInstanceId}`)
  }
  return editor
}

export function createPageDesignEditorGetter(
  headlessRegistry: ReadonlyMap<string, ProjectWorkspace>,
): (context: { moduleInstanceId: string }) => ProjectWorkspace {
  return (context) => resolvePageDesignEditor(
    { moduleInstanceId: context.moduleInstanceId },
    headlessRegistry,
  )
}
