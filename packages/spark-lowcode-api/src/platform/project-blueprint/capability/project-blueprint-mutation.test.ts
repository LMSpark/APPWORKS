import { describe, expect, it } from 'vitest'

import { ProjectBlueprint, ProjectBlueprintNode } from '../project-blueprint.js'

function blueprint(): ProjectBlueprint {
  return new ProjectBlueprint('PROJECT-1', [new ProjectBlueprintNode({
    id: 'ROOT', parentId: '', projectId: 'PROJECT-1', title: '项目', kind: 'project', description: '',
    legacyContentId: '', legacyContentType: '', runtimeTarget: '', runtimeNavigationCandidate: true,
    order: 0, source: {},
  })])
}

describe('ProjectBlueprint mutation capability', () => {
  it('prepares a bounded command with preimage, journal, readback and compensation', () => {
    const project = blueprint()
    const node = project.findNode('ROOT')!
    const planner = project.outputs.governance.mutationPlanner()

    expect(planner.prepare({
      nodeId: 'ROOT', capability: 'update-planning-content', idempotencyKey: 'CHANGE-1',
      preimage: node.toSnapshot(), change: { description: '新需求' },
    })).toMatchObject({
      kind: 'project-blueprint-mutation', risk: 'low', journal: { required: true },
      readback: { required: true, nodeId: 'ROOT' },
      compensation: { kind: 'restore-project-blueprint-node' },
    })
  })

  it('fails closed for an undeclared node capability', () => {
    const project = blueprint()
    const node = project.findNode('ROOT')!
    const planner = project.outputs.governance.mutationPlanner()

    expect(() => planner.prepare({
      nodeId: 'ROOT', capability: 'update-permission-design', idempotencyKey: 'CHANGE-2',
      preimage: node.toSnapshot(), change: { permissionDesignId: 'PERM-1' },
    })).toThrow('未声明 capability')
  })
})
