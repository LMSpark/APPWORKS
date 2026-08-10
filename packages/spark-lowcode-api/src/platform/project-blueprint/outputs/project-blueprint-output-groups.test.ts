import { describe, expect, it } from 'vitest'

import { ProjectBlueprint, ProjectBlueprintNode } from '../project-blueprint.js'

function blueprint(): ProjectBlueprint {
  return new ProjectBlueprint('PROJECT-1', [
    new ProjectBlueprintNode({
      id: 'ROOT', parentId: '', projectId: 'PROJECT-1', title: '项目', kind: 'project', description: '建设薪资系统',
      legacyContentId: '', legacyContentType: '', runtimeTarget: '', runtimeNavigationCandidate: true,
      order: 0, source: {},
    }),
    new ProjectBlueprintNode({
      id: 'PAGE-1', parentId: 'ROOT', projectId: 'PROJECT-1', title: '工资核算', kind: 'page', description: '核算月薪',
      legacyContentId: 'LEGACY-CONID', legacyContentType: 'Model', runtimeTarget: 'vue:payroll/salary',
      runtimeNavigationCandidate: true, order: 1, source: {},
    }),
  ])
}

describe('ProjectBlueprint output groups', () => {
  it('keeps planning, governance, delivery closure and AI output under one blueprint snapshot', () => {
    const project = blueprint()
    const evidence = [{
      nodeId: 'PAGE-1', formKey: 'FORM-1', dataSpaceId: 'SPACE-1', modelId: 'MODEL-1',
      componentKey: 'vue:payroll/salary', routePath: '/payroll/salary',
    }]

    expect(project.outputs.planning.context().nodes).toHaveLength(2)
    expect(project.outputs.governance.audit().unresolvedNodeIds).toEqual(['PAGE-1'])
    expect(project.outputs.governance.audit(evidence).valid).toBe(true)
    expect(project.outputs.delivery.pageRuntimeClosures(evidence)[0]).toMatchObject({
      projectId: 'PROJECT-1', nodeId: 'PAGE-1', formKey: 'FORM-1', dataSpaceId: 'SPACE-1', modelId: 'MODEL-1',
    })
    expect(project.outputs.ai.planningInput()).toMatchObject({
      kind: 'project-blueprint-planning-input',
      nodes: [{ id: 'ROOT', requirement: '建设薪资系统' }, { id: 'PAGE-1', requirement: '核算月薪' }],
    })
  })
})
