/**
 * @module app:lowcode/resources/repository/agent-workflow/creation-scaffold
 * 职责：生成有明确创建命令关联的未发布工作流首稿。
 * 边界：仅生成设计态JSON，不登记运行别名、不发布、不写文件。
 */
/** 首稿的明确身份与标题；commandId用于派发后原目标核验。 */
type Input = Readonly<{workflowId: string; title: string; commandId: string}>

/** 按原领域模板生成三个节点和两条端口连线；占位绑定必须经设计后才能发布。 */
export function createAgentWorkflowScaffold(input: Input): string {
  const placeholder = 'spark.placeholder.workflow', root = 'spark.placeholder.RootModel', model = 'spark.placeholder.Model'
  const runtimeBinding = {registration: {alias: placeholder, moduleId: placeholder, businessId: placeholder},
    inputContract: {identityField: 'input', messageField: 'input', paramsSchema: {type: 'object', properties: {}, additionalProperties: false}, readonlySteps: []},
    systemPrompt: {template: 'spark.placeholder.prompt', conditionalHints: []},
    modelProjectionRef: {kind: 'dts-class-model', rootClassName: root, manifestUrlRef: 'dts-class-model'},
    executableRef: {kind: 'js-module', moduleSpecifier: 'spark.placeholder.module', exportName: model},
    resolveInstance: {editorSource: placeholder, identityField: 'input'}}
  const nodes = [
    {id: 'start', type: 'start', position: {x: 0, y: 0}, data: {type: 'start', title: 'Start', desc: 'Workflow input', inputs: {}, projection: {}, validation: {}, state: {}}},
    {id: 'node.model', type: 'node', position: {x: 260, y: 0}, data: {type: 'node', title: 'Business Node',
      desc: 'Bind models, inputs, outputs, and a projected completion member before publishing.',
      models: [{id: 'node.model.model', rootClassName: root, className: model, sourceRef: '$'}], inputs: {}, outputs: {},
      llm: {task: {goal: '', requirements: {}, contextInputs: {}}, knowledge: {rootClassName: root, className: model, allowedActions: [], readableAttributes: []},
        functionCalling: {mode: 'freeWithinModelContext', constraints: []}, output: {structuredResult: {}, handoffToValidation: true}},
      validation: {}, state: {}, result: {}, capabilities: []}},
    {id: 'output', type: 'output', position: {x: 520, y: 0}, data: {type: 'output', title: 'Output', desc: 'Workflow output', outputs: {}, upstreamValidation: {}, validation: {}, state: {}, result: {}, capabilities: []}},
  ]
  const lines = [
    {id: 'line.start.node', type: 'custom', from: {nodeId: 'start', modelId: '$workflow', memberName: 'input'}, to: {nodeId: 'node.model', modelId: 'node.model.model', memberName: 'input'}, data: {relation: 'sequence', branch: {label: 'default', default: true}, validation: {}}},
    {id: 'line.node.output', type: 'custom', from: {nodeId: 'node.model', modelId: 'node.model.model', memberName: 'result'}, to: {nodeId: 'output', modelId: '$workflow', memberName: 'result'}, data: {relation: 'sequence', branch: {label: 'default', default: true}, validation: {}}},
  ]
  return JSON.stringify({kind: 'agent.workflow.design', version: 1, id: input.workflowId,
    workflow: {id: input.workflowId, version: 1, variables: [], capabilities: [], runtimeBinding, graph: {id: `${input.workflowId}.graph`, nodes, lines, viewport: {x: 0, y: 0, zoom: 1}}},
    x_spark: {schema: 'spark.agent.workflow.design.v1', designer: {title: input.title.trim() || input.workflowId},
      draft: {status: 'draft', dirtyPaths: []}, validation: {status: 'unknown', issues: []}, history: {commands: []}, creation: {commandId: input.commandId}}}, null, 2)
}
