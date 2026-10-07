import { describe, expect, it } from 'vitest'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
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
  it('returns the editor unchanged without allowedOperations', () => {
    const editor = createEditor()
    expect(guardPageDesignEditor(editor, undefined)).toBe(editor)
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
    await expect(Promise.resolve().then(() => guarded.loadScenarioViews({ scenarioId: 'S' }))).rejects.toThrow('PAGE_DESIGN_OPERATION_FORBIDDEN')
  })

  it('blocks blueprint mutation and keeps private-field methods working through the facade', () => {
    const guarded = guardPageDesignEditor(createEditor(), { blueprint: false })
    expect(() => guarded.project.replaceBlueprintChildren([])).toThrow('PAGE_DESIGN_OPERATION_FORBIDDEN')
    expect(guarded.project.projectId).toBe('demo')
    expect(guarded.project.readPlanningProjection()).toEqual([])
  })
})
