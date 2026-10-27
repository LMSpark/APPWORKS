import {describe, expect, it} from 'vitest'
import {ProjectWorkspace} from '../../src/project/project-workspace'
import type {ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData} from '../../src/blueprint/project-blueprint-node'

function node(id: string): ProjectBlueprintTreeNodeData {
  return {nodeId: id, parentNodeId: 'root', projectId: 'demo', kind: 'module', capability: {name: id}, source: {}}
}

function workspace() {
  const root: ProjectBlueprintTreeData = {...node('root'), parentNodeId: '', children: [node('a')]}
  const editor = new ProjectWorkspace({projectId: 'demo', pageFiles: {readPageFile: async () => ''}, blueprint: {}})
  editor.project.replaceBlueprintTree(structuredClone(root))
  return {editor}
}

describe('ProjectWorkspace blueprint write boundary', () => {
  it('does not expose legacy direct blueprint mutation and save methods', () => {
    const {editor} = workspace()
    for (const name of ['addBlueprintNode', 'deleteNode', 'moveMountedPage', 'saveProjectLayout', 'saveSelectedBlueprintNode']) {
      expect(name in editor, name).toBe(false)
    }
  })

  it('does not expose ProjectWorkspace direct page file write or aggregate save methods', () => {
    const {editor} = workspace()
    for (const name of ['savePageFile', 'saveDirtyPageFiles', 'saveAll']) {
      expect(name in editor, name).toBe(false)
    }
  })
})
