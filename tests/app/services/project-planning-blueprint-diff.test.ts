import { describe, expect, it } from 'vitest'
import type { ProjectBlueprintTreeData, ProjectBlueprintTreeNodeData } from '@spark-appworks/spark-project-model'
import { planProjectBlueprintReplacement } from '@/services/project-planning/project-planning-blueprint-diff'

const projectId = 'APP-A'

function node(
  nodeId: string,
  parentNodeId: string,
  kind: ProjectBlueprintTreeNodeData['kind'] = 'page',
  children?: ProjectBlueprintTreeNodeData[],
): ProjectBlueprintTreeNodeData {
  return {
    nodeId, parentNodeId, projectId, kind, capability: { name: nodeId },
    navigation: { title: nodeId, order: 0, publishInMenu: true, showChildren: true, beginGroup: false },
    source: {}, ...(children === undefined ? {} : { children }),
  }
}

function root(children: ProjectBlueprintTreeNodeData[] = []): ProjectBlueprintTreeData {
  return { ...node('root', '', 'module', children), children }
}

describe('projectPlanning full-tree replacement plan', () => {
  it('plans parent-first creates, a move with mapped fields, updates, and child-first deletes', () => {
    const current = root([
      node('a', 'root'),
      node('b', 'root', 'module', [node('b-child', 'b')]),
      node('gone', 'root'),
    ])
    const moved = { ...node('a', 'new-parent'), capability: { name: 'A renamed' } }
    const target = [node('new-parent', 'root', 'module', [moved, node('new-child', 'new-parent')])]

    const plan = planProjectBlueprintReplacement(current, target, { projectId })

    expect(plan.commands.map(command => command.kind)).toEqual(['create', 'create', 'move', 'delete', 'delete', 'delete'])
    expect(plan.commands.map(command => command.nodeId)).toEqual(['new-parent', 'new-child', 'a', 'b-child', 'b', 'gone'])
    expect(plan.commands[2]).toMatchObject({ kind: 'move', nodeId: 'a', fields: { prowid: 'new-parent', name: 'A renamed' } })
    expect(plan.expectedTree.children[0]?.children?.map(child => child.nodeId)).toEqual(['a', 'new-child'])
    expect(Object.isFrozen(plan) && Object.isFrozen(plan.commands) && Object.isFrozen(plan.expectedTree)).toBe(true)
  })

  it('plans sibling reordering through formal FunOrderValue fields and leaves no-op plans empty', () => {
    const current = root([node('a', 'root'), node('b', 'root')])
    const reversed = [
      { ...node('b', 'root'), navigation: { ...node('b', 'root').navigation!, order: 1 } },
      { ...node('a', 'root'), navigation: { ...node('a', 'root').navigation!, order: 2 } },
    ]

    const reordered = planProjectBlueprintReplacement(current, reversed, { projectId })
    const unchanged = planProjectBlueprintReplacement(current, current.children, { projectId })

    expect(reordered.commands).toMatchObject([
      { kind: 'reorder', nodeId: 'b', parentNodeId: 'root', siblingIndex: 0, fields: { FunOrderValue: 1 } },
      { kind: 'reorder', nodeId: 'a', parentNodeId: 'root', siblingIndex: 1, fields: { FunOrderValue: 2 } },
    ])
    expect(unchanged.commands).toEqual([])
  })

  it.each([
    ['duplicate IDs', [node('a', 'root'), node('a', 'root')]],
    ['missing parent', [{ ...node('a', 'missing'), children: [node('b', 'missing')] }]],
    ['wrong project', [{ ...node('a', 'root'), projectId: 'APP-B' }]],
    ['parent identity mismatch', [{ ...node('a', 'root', 'module', [node('b', 'wrong-parent')]) }]],
  ])('rejects %s before producing a plan', (_case, target) => {
    expect(() => planProjectBlueprintReplacement(root(), target, { projectId })).toThrow()
  })

  it('rejects the root as a child and unsupported source/data-space payloads', () => {
    expect(() => planProjectBlueprintReplacement(root(), [node('root', 'root', 'module')], { projectId })).toThrow(/root|根|重复/iu)
    expect(() => planProjectBlueprintReplacement(root(), [{
      ...node('a', 'root'), source: { unprojectedBackendField: 'value' },
    }], { projectId })).toThrow(/source|wire|字段/iu)
    expect(() => planProjectBlueprintReplacement(root(), [{
      ...node('a', 'root'), dataSpace: { scenarioId: 'SCENE-1', models: [{ metaName: 'Orders' }] },
    }], { projectId })).toThrow(/models|wire|字段/iu)
  })

  it('rejects tree objects with child cycles instead of truncating them', () => {
    const cyclic = node('a', 'root', 'module')
    cyclic.children = [cyclic]
    expect(() => planProjectBlueprintReplacement(root(), [cyclic], { projectId })).toThrow(/cycle|循环|重复/iu)
  })

  it('rejects plans whose formal DataView output omits a non-default command field', () => {
    expect(() => planProjectBlueprintReplacement(root(), [node('a', 'root')], {
      projectId, availableFields: ['conType', 'prowid'],
    })).toThrow(/未正式输出.*name/iu)
  })
})
