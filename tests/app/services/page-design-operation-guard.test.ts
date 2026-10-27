import { describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type {
  ProjectBlueprintGateway,
  ProjectBlueprintTreeData,
  ProjectBlueprintTreeNodeData,
} from '@spark-appworks/spark-project-model'
import { guardPageDesignEditor } from '@/services/page-design/page-design-operation-guard'

function createEditor(): ProjectWorkspace {
  const editor = new ProjectWorkspace({
    projectId: 'demo',
    pageFiles: { readPageFile: async () => '' },
    blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) },
  })
  editor.project.replaceBlueprintTree({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root' }, source: {}, children: [] })
  return editor
}

describe('guardPageDesignEditor', () => {
  it('fails closed for gateway-backed loadBlueprint reads',()=>{
    const editor=createEditor()
    const guarded=guardPageDesignEditor(editor,{blueprint:true})
    expect(()=>guarded.loadBlueprint()).toThrow('PAGE_DESIGN_BLUEPRINT_DATAVIEW_REQUIRED')
  })

  it('fails closed for gateway-backed previewBlueprintRemote reads',()=>{
    const editor=createEditor()
    const guarded=guardPageDesignEditor(editor,{blueprint:true})
    expect(()=>guarded.previewBlueprintRemote()).toThrow('PAGE_DESIGN_BLUEPRINT_DATAVIEW_REQUIRED')
  })

  it('always denies raw scenario storage even without an operation restriction', () => {
    const editor = createEditor()
    const guarded = guardPageDesignEditor(editor, undefined)
    expect(guarded.project.projectId).toBe('demo')
    expect(() => guarded.getScenarioViews('S')).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect(() => guarded.loadScenarioViews({scenarioId: 'S'})).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect('restoreScenarioVersion' in editor).toBe(false)
    expect(() => guarded.saveDirtyScenarioDefinitions()).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect(() => guarded.dispose()).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
  })

  it('blocks a forbidden file domain while allowing other files on the same tool', () => {
    const guarded = guardPageDesignEditor(createEditor(), { script: false })
    const page = guarded.project.openPageDesign('orders')
    expect(() => page.setFileText('script.js', 'x')).toThrow('PAGE_DESIGN_OPERATION_FORBIDDEN')
    expect(() => page.setFileText('style.css', 'a{}')).not.toThrow()
  })

  it('blocks nodeTree access and scenario loading when their domains are closed', async () => {
    const guarded = guardPageDesignEditor(createEditor(), { nodeTree: false, dataSet: false })
    const page = guarded.project.openPageDesign('orders')
    expect(() => page.nodeTree).toThrow('PAGE_DESIGN_OPERATION_FORBIDDEN')
    await expect(Promise.resolve().then(() => guarded.loadScenarioDefinitions({ scenarioId: 'S' }))).rejects.toThrow('PAGE_DESIGN_OPERATION_FORBIDDEN')
  })

  it('blocks blueprint mutation and keeps private-field methods working through the facade', () => {
    const guarded = guardPageDesignEditor(createEditor(), { blueprint: false })
    expect(() => guarded.project.replaceBlueprintChildren([])).toThrow('PAGE_DESIGN_OPERATION_FORBIDDEN')
    expect(guarded.project.projectId).toBe('demo')
    expect(guarded.project.readPlanningProjection()).toEqual([])
  })

  it('denies direct blueprint gateway writes even when blueprint operations are allowed', async () => {
    const root: ProjectBlueprintTreeData = { nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }
    const gateway: ProjectBlueprintGateway = {
      loadRoot: vi.fn(async () => root),
      addNode: vi.fn(async ({ node }: { parentId?: string | null; node: ProjectBlueprintTreeNodeData; index?: number }) => node),
      updateNode: vi.fn(async (id, patch) => ({ ...root, ...patch, nodeId: id })),
      deleteNode: vi.fn(async () => null),
      moveNode: vi.fn(async (id: string) => ({ ...root, nodeId: id })),
    }
    const editor = new ProjectWorkspace({ projectId: 'demo', pageFiles: { readPageFile: async () => '' }, blueprint: gateway })
    editor.project.replaceBlueprintTree(root)
    const guarded = guardPageDesignEditor(editor, { blueprint: true })
    expect(() => guarded.addBlueprintNode({ node: root })).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect(() => guarded.saveProjectLayout()).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect(() => guarded.deleteNode('n')).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect(() => guarded.moveMountedPage('n', null, 0)).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect(() => guarded.saveSelectedBlueprintNode()).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect(gateway.addNode).not.toHaveBeenCalled()
    expect(gateway.updateNode).not.toHaveBeenCalled()
    expect(gateway.deleteNode).not.toHaveBeenCalled()
    expect(gateway.moveNode).not.toHaveBeenCalled()
    expect(() => guarded.loadBlueprint()).toThrow('PAGE_DESIGN_BLUEPRINT_DATAVIEW_REQUIRED')
    expect(() => guarded.previewBlueprintRemote()).toThrow('PAGE_DESIGN_BLUEPRINT_DATAVIEW_REQUIRED')
    expect(gateway.loadRoot).not.toHaveBeenCalled()
  })

  it('denies remote PageTool file and version writes while preserving local draft edits and reads', async () => {
    const fileApi = {
      saveFileContent: vi.fn(async () => undefined),
      createVersion: vi.fn(async () => undefined),
      restoreVersion: vi.fn(async () => undefined),
    }
    const editor = new ProjectWorkspace({
      projectId: 'demo',
      pageFiles: { readPageFile: async () => '', ...fileApi },
      blueprint: { loadRoot: async () => ({ nodeId: 'root', parentNodeId: '', projectId: 'demo', kind: 'module', capability: { name: 'Root' }, source: {}, children: [] }) },
    })
    const guarded = guardPageDesignEditor(editor, { script: true, style: true, nodeTree: true })
    const page = guarded.project.openPageDesign('orders')
    guarded.project.setActivePage('orders')
    expect(() => page.setFileText('script.js', 'draft')).not.toThrow()
    expect(() => guarded.savePageFile('script.js')).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect(() => guarded.saveDirtyPageFiles()).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect(() => guarded.savePageFileChange({ pageId: 'orders', fileName: 'script.js', expectedText: '', text: 'x' })).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect(() => guarded.createRemotePageVersion('script.js')).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect(() => guarded.restoreRemotePageVersion(1, 'script.js')).toThrow('PAGE_DESIGN_STORAGE_INTERNAL')
    expect('deleteRemotePageVersion' in editor).toBe(false)
    expect(fileApi.saveFileContent).not.toHaveBeenCalled()
    expect(fileApi.createVersion).not.toHaveBeenCalled()
    expect(fileApi.restoreVersion).not.toHaveBeenCalled()
    expect(page.getFileText('script.js')).toBe('draft')
  })
})
