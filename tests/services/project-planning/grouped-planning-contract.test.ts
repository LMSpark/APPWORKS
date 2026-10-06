import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createAppAgentWorkflowRuntimeBindings } from '@/services/ai/agent-workflow-bindings'
import { createAgentWorkflowDefinitionFromDesign } from '@/services/workflow-designs'
import { evaluateProjectPlanningToolGate } from '@/services/project-planning/project-planning-agent-workflow-binding'

describe('projectPlanning formal node input', () => {
  it('interpolates the formal kind and teaches grouped blueprint writes', () => {
    const prompt = createAppAgentWorkflowRuntimeBindings({}).systemPromptInterpolator({
      editorSource: 'projectPlanning', template: '', hints: [], input: {
        projectScopeKey: 'APP-A', projectId: 'APP-A', requirement: '订单与库存管理',
        blueprintNodes: [{ nodeId: 'orders', title: '订单', kind: 'page', requirement: '订单查询' }],
      },
    })
    expect(prompt).toContain('orders (page) 订单')
    expect(prompt).toContain('capability: { name:')
    expect(prompt).toContain('parentNodeId: "core-module"')
    expect(prompt).not.toContain('blueprintKind')
    expect(prompt).not.toContain('nodeKind')
  })

  it('rejects the retired planning fields instead of inferring kind', () => {
    expect(() => createAppAgentWorkflowRuntimeBindings({}).systemPromptInterpolator({
      editorSource: 'projectPlanning', template: '', hints: [], input: {
        projectScopeKey: 'APP-A', projectId: 'APP-A', requirement: '需求',
        blueprintNodes: [{ nodeId: 'old', title: 'Old', blueprintKind: 'page', nodeKind: 'page', requirement: '需求' }],
      },
    })).toThrow('kind')
  })

  it('accepts an explicitly included node with an empty requirement', () => {
    const prompt = createAppAgentWorkflowRuntimeBindings({}).systemPromptInterpolator({
      editorSource: 'projectPlanning', template: '', hints: [], input: {
        projectScopeKey: 'APP-A', projectId: 'APP-A', requirement: '项目需求',
        blueprintNodes: [{ nodeId: 'empty', title: '待策划', kind: 'module', requirement: '' }],
      },
    })
    expect(prompt).toContain('empty (module) 待策划')
  })

  it('routes ProjectBlueprint actions to the action guide', () => {
    expect(evaluateProjectPlanningToolGate({
      toolName: 'model_attribute_guide', args: { kind: 'ProjectBlueprint', attributeName: 'replaceBlueprintChildren' },
    })).toEqual(expect.objectContaining({ ok: false, fix: expect.stringContaining('kind: "ProjectBlueprint"') }))
  })

  it('keeps the saved planning definition equal to the design projection', () => {
    const base = 'config/agent-workflows/lmspark/homepage/agent.workflow.projectPlanning/'
    const design = JSON.parse(readFileSync(`${base}design.json`, 'utf8'))
    const definition = JSON.parse(readFileSync(`${base}definition.json`, 'utf8'))
    const projection = createAgentWorkflowDefinitionFromDesign(design, { publishedAt: definition.x_spark.publishedAt })
    expect(projection).toEqual(definition)
    expect(definition.workflow.runtimeBinding.inputContract.paramsSchema.properties.blueprintNodes.items.required)
      .toEqual(['nodeId', 'title', 'kind', 'requirement'])
  })
})
