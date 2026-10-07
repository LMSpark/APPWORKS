import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildPageDesignToolLoopNudge, formatPageDesignSystemPrompt } from '@/services/page-design/page-design-agent-workflow-binding'
import { createAgentWorkflowDefinitionFromDesign, parseWorkflowDesignJson } from '@/services/workflow-designs'
import { PageTool, ProjectBlueprint, ProjectWorkspace, ScenarioViewFile } from '@spark-appworks/spark-project-model'
import { createAppAgentWorkflowRuntimeBindings } from '@/services/ai/agent-workflow-bindings'

const baseInput = { requestId: 'request-A', pageId: 'leave-request-page', description: '补充表单',
  effectiveDescription: '请假申请列表及明细', planningTitle: '请假申请', projectId: 'demo' }
const SCENARIO_ONLY_OPERATIONS = { nodeTree: false, dataSet: true, script: false, style: false, blueprint: false } as const

describe('pageDesign formal workflow contract', () => {
  it('uses three page files and explicitly supplied scenario views', () => {
    const prompt = formatPageDesignSystemPrompt({ ...baseInput, scenarioId: 'SCENE-A' })
    expect(prompt).toContain('ProjectWorkspace')
    expect(prompt).toContain('PageTool')
    expect(prompt).toContain('ScenarioViewFile')
    expect(prompt).toContain('loadScenarioViews({ scenarioId: "SCENE-A" })')
    expect(prompt).toContain('views.setText')
    expect(prompt).toContain('#scenarioId@table@view')
    expect(prompt).toContain('mainScenarioId')
    expect(prompt).not.toContain('pagedata.json')
    expect(prompt).not.toContain('ConfigPageNode')
    expect(prompt).not.toContain('editDataSet')
  })
  it('requires explicit scenario identity for scene-only operations', () => {
    expect(() => formatPageDesignSystemPrompt({ ...baseInput, allowedOperations: SCENARIO_ONLY_OPERATIONS })).toThrow('scenarioId')
    expect(formatPageDesignSystemPrompt({ ...baseInput })).toContain('未提供 scenarioId')
  })
  it('nudges with the real PageTool and ScenarioViewFile operations', () => {
    expect(buildPageDesignToolLoopNudge('execution_phase', baseInput.pageId)).toContain('this.project.openPageDesign')
    expect(buildPageDesignToolLoopNudge('execution_phase', baseInput.pageId, SCENARIO_ONLY_OPERATIONS)).toContain('页面三文件本轮禁止修改')
    expect(buildPageDesignToolLoopNudge('model_script_retry', baseInput.pageId)).toContain('RECOVERY_HINT')
  })
  it('requires requestId in the app prompt consumer', () => {
    expect(() => createAppAgentWorkflowRuntimeBindings({}).systemPromptInterpolator({
      editorSource: 'pageDesign', template: '', hints: [], input: { pageId: 'orders', description: 'd', effectiveDescription: 'd' },
    })).toThrow('requestId')
  })
  it('registers exactly the executables declared by the saved workflow definitions', () => {
    const declared = ['agent.workflow.pageDesign', 'agent.workflow.projectPlanning'].map((workflowId) => {
      const definition = JSON.parse(readFileSync(`config/agent-workflows/lmspark/homepage/${workflowId}/definition.json`, 'utf8'))
      const ref = definition.workflow.runtimeBinding.executableRef
      return `${ref.moduleSpecifier}#${ref.exportName}`
    })
    const registry = createAppAgentWorkflowRuntimeBindings({}).executableRegistry
    expect(Object.keys(registry).sort()).toEqual([...declared].sort())
    expect(registry['@spark-appworks/spark-project-model#ProjectWorkspace']).toBe(ProjectWorkspace)
    expect(registry['@spark-appworks/spark-project-model#ProjectBlueprint']).toBe(ProjectBlueprint)
  })
  it('keeps saved assets equal to the executable design projection', () => {
    const base = 'config/agent-workflows/lmspark/homepage/agent.workflow.pageDesign/'
    const design = JSON.parse(readFileSync(`${base}design.json`, 'utf8'))
    const definition = JSON.parse(readFileSync(`${base}definition.json`, 'utf8'))
    const projected = createAgentWorkflowDefinitionFromDesign(design, { publishedAt: definition.x_spark.publishedAt })
    expect(projected).toEqual(definition)
    expect(definition.workflow.runtimeBinding.inputContract.identityField).toBe('requestId')
    expect(definition.workflow.runtimeBinding.resolveInstance.identityField).toBe('requestId')
    expect(definition.workflow.runtimeBinding.modelProjectionRef.rootClassName).toBe('ProjectWorkspace')
  })
  it('binds sequence endpoints to existing models and actual class members', () => {
    const design = parseWorkflowDesignJson(readFileSync('config/agent-workflows/lmspark/homepage/agent.workflow.pageDesign/design.json', 'utf8'))
    const prototypes: Record<string, object> = { PageTool: PageTool.prototype, ProjectWorkspace: ProjectWorkspace.prototype, ScenarioViewFile: ScenarioViewFile.prototype }
    for (const line of design.workflow.graph.lines) {
      for (const endpoint of [line.from, line.to]) {
        const node = design.workflow.graph.nodes.find(item => item.id === endpoint.nodeId)
        expect(node).toBeDefined()
        if (node?.type !== 'node') {
          expect(endpoint.modelId).toBe('$workflow')
          expect(endpoint.memberName).toBe(endpoint.nodeId === 'start' ? 'pageId' : 'result')
          continue
        }
        const model = node.data?.models?.find(item => item['id'] === endpoint.modelId)
        expect(model).toBeDefined()
        const className = model?.['className']
        if (typeof className !== 'string') throw new Error('Missing endpoint class')
        const prototype = prototypes[className]
        if (prototype === undefined) throw new Error(`Unknown endpoint class ${className}`)
        expect(endpoint.memberName in prototype).toBe(true)
      }
    }
  })
})
