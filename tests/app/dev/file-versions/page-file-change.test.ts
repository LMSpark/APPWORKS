import {describe, expect, it} from 'vitest'
import {ProjectWorkspace} from '@spark-appworks/spark-project-model'

describe('checked tool file changes', () => {
  it('does not confirm an acknowledged write when the remote original is unchanged', async () => {
    let writes = 0
    const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {},
      pageFiles: {readPageFile: async () => 'old', saveFileContent: async () => {writes++}}})
    await expect(workspace.savePageFileChange({pageId: 'TOOL', fileName: 'script.js', expectedText: 'old', text: 'new'})).rejects.toThrow(/回读未确认/)
    expect(writes).toBe(1)
  })

  it('serializes concurrent checked changes for one tool file', async () => {
    let rule = '{"type":"r-text"}', finish = () => {}, writes = 0
    const waiting = new Promise<void>(resolve => {finish = resolve})
    const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {}, pageFiles: {
      readPageFile: async input => input.fileName === 'rule.json' ? rule : '',
      saveFileContent: async (_id, _name, text) => {writes++; await waiting; rule = text},
    }})
    await workspace.selectPage('TOOL')
    const saving = workspace.savePageFileChange({pageId: 'TOOL', fileName: 'rule.json', expectedText: rule, text: '{"type":"r-table"}'})
    await expect(workspace.savePageFileChange({pageId: 'TOOL', fileName: 'rule.json', expectedText: rule, text: '{"type":"r-button"}'})).rejects.toThrow(/正在保存/)
    finish(); await saving
    expect(writes).toBe(1); expect(workspace.getActivePageTool()!.rule.children[0]?.type).toBe('r-table')
    expect(workspace.getActivePageTool()!.isDirty()).toBe(false)
  })
})
