#!/usr/bin/env node

import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const WORKFLOW_ROOT = path.resolve(
  import.meta.dirname,
  '..',
  'config',
  'agent-workflows',
  'lmspark',
  'homepage',
)

const OLD_WORKFLOW_IDS = [
  'agent.workflow.20260615130850',
  'agent.workflow.20260615130928',
]

const PUBLISHED_AT = '2026-06-20T00:00:00.000Z'
const PROJECT_MODEL_PROJECTION_REF = {
  kind: 'dts-class-model',
  rootClassName: 'ProjectModel',
  manifestUrlRef: 'dts-class-model',
}
const PROJECT_MODEL_EXECUTABLE_REF = {
  kind: 'js-module',
  moduleSpecifier: '@spark-appworks/spark-project-model',
  exportName: 'ProjectModel',
}

const stringSchema = { type: 'string' }
const booleanSchema = { type: 'boolean' }

const allowedOperationsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nodeTree: booleanSchema,
    dataSet: booleanSchema,
    script: booleanSchema,
    style: booleanSchema,
    blueprint: booleanSchema,
  },
}

const pageDesignParamsSchema = {
  type: 'object',
  properties: {
    pageId: stringSchema,
    description: stringSchema,
    effectiveDescription: stringSchema,
    projectId: stringSchema,
    planningTitle: stringSchema,
    planningPath: stringSchema,
    mode: { type: 'string', enum: ['create', 'update', 'fix'] },
    allowedOperations: allowedOperationsSchema,
    preserveExistingInteractions: booleanSchema,
    strictImplGate: booleanSchema,
  },
  required: ['pageId', 'description', 'effectiveDescription'],
  additionalProperties: false,
}

const projectPlanningParamsSchema = {
  type: 'object',
  properties: {
    tenantId: stringSchema,
    projectScopeKey: stringSchema,
    projectId: stringSchema,
    requirement: stringSchema,
    planningAttachmentRef: stringSchema,
    blueprintNodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nodeId: stringSchema,
          title: stringSchema,
          blueprintKind: stringSchema,
          nodeKind: stringSchema,
          requirement: stringSchema,
          planningAttachmentRef: stringSchema,
        },
        required: ['nodeId', 'title', 'blueprintKind', 'nodeKind', 'requirement'],
        additionalProperties: false,
      },
    },
  },
  required: ['projectScopeKey', 'projectId', 'requirement', 'blueprintNodes'],
  additionalProperties: false,
}

async function main() {
  await mkdir(WORKFLOW_ROOT, { recursive: true })
  for (const workflowId of OLD_WORKFLOW_IDS) {
    await removeWorkflowDirectory(workflowId)
  }
  await writeWorkflow(createPageDesignWorkflowDesign())
  await writeWorkflow(createProjectPlanningWorkflowDesign())
}

async function removeWorkflowDirectory(workflowId) {
  const target = resolveWorkflowDirectory(workflowId)
  await rm(target, { recursive: true, force: true })
}

async function writeWorkflow(design) {
  const target = resolveWorkflowDirectory(design.id)
  await mkdir(target, { recursive: true })
  design.x_spark.validation = createDefinitionValidation(design)
  await writeJson(path.join(target, 'design.json'), design)
  await writeJson(path.join(target, 'definition.json'), createDefinitionFromDesign(design))
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function resolveWorkflowDirectory(workflowId) {
  const target = path.resolve(WORKFLOW_ROOT, workflowId)
  const rootWithSeparator = `${WORKFLOW_ROOT}${path.sep}`
  if (!target.startsWith(rootWithSeparator)) {
    throw new Error(`Refusing to write workflow outside root: ${target}`)
  }
  return target
}

function createDefinitionFromDesign(design) {
  const validation = createDefinitionValidation(design)
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId: design.workflow.id,
    source: {
      designKind: design.kind,
      designId: design.id,
      designVersion: design.version,
    },
    workflow: {
      runtimeBinding: design.workflow.runtimeBinding,
      variables: design.workflow.variables,
      capabilities: design.workflow.capabilities,
      graph: {
        nodes: design.workflow.graph.nodes,
        lines: design.workflow.graph.lines,
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.definition.v1',
      publishedAt: PUBLISHED_AT,
      validation,
    },
  }
}

function createDefinitionValidation(design) {
  const issues = collectDefinitionValidationIssues(design)
  return {
    status: issues.some((issue) => issue.severity === 'error') ? 'invalid' : 'valid',
    issues,
  }
}

function collectDefinitionValidationIssues(design) {
  const issues = []
  if (design.workflow.runtimeBinding === undefined) {
    issues.push({
      severity: 'error',
      code: 'AGENT_WORKFLOW_RUNTIME_BINDING_MISSING',
      message: 'Workflow must bind workflow.runtimeBinding before publishing.',
      path: 'workflow.runtimeBinding',
    })
  }
  for (const node of design.workflow.graph.nodes ?? []) {
    if (node.type !== 'node' && node.data?.type !== 'node') continue
    const models = Array.isArray(node.data?.models) ? node.data.models : []
    if (Object.prototype.hasOwnProperty.call(node.data ?? {}, 'model')) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_MODEL_FIELD',
        message: `Business node "${node.id}" must use models[] instead of legacy model.`,
        nodeId: node.id,
        path: `workflow.graph.nodes.${node.id}.data.model`,
      })
    }
    if (models.length === 0) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_MODELS_MISSING',
        message: `Business node "${node.id}" must bind at least one models[] entry before publishing.`,
        nodeId: node.id,
        path: `workflow.graph.nodes.${node.id}.data.models`,
      })
      continue
    }
    const primaryModel = models[0]
    if (typeof primaryModel.rootClassName !== 'string' || primaryModel.rootClassName.trim().length === 0) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_MODEL_ROOT_MISSING',
        message: `Business node "${node.id}" must bind a real models[0].rootClassName before publishing.`,
        nodeId: node.id,
        path: `workflow.graph.nodes.${node.id}.data.models[0].rootClassName`,
      })
    }
    if (typeof primaryModel.className !== 'string' || primaryModel.className.trim().length === 0) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_MODEL_CLASS_MISSING',
        message: `Business node "${node.id}" must bind a real models[0].className before publishing.`,
        nodeId: node.id,
        path: `workflow.graph.nodes.${node.id}.data.models[0].className`,
      })
    }
    const completion = primaryModel.completion
    if (typeof completion?.memberName !== 'string' || completion.memberName.trim().length === 0) {
      issues.push({
        severity: 'error',
        code: 'AGENT_WORKFLOW_MODEL_COMPLETION_MISSING',
        message: `Business node "${node.id}" must bind a projected models[0].completion.memberName before publishing.`,
        nodeId: node.id,
        path: `workflow.graph.nodes.${node.id}.data.models[0].completion.memberName`,
      })
    }
  }
  return issues
}

function createPageDesignWorkflowDesign() {
  const workflowId = 'agent.workflow.pageDesign'
  const businessNodes = [
    pageDesignStageNode({
      id: 'node.pageEntry',
      title: 'Page Entry and Intent',
      desc: '100-step stages 1-10: normalize intent, page id, and workflow entry facts.',
      models: [
        modelContext('node.pageEntry.project', 'ProjectModel'),
        modelContext('node.pageEntry.page', 'ConfigPageNode', {
          sourceRef: 'node.pageEntry.project',
          via: [{ memberName: 'openPageDesign', kind: 'method', sourceRef: 'node.pageEntry.project' }],
        }),
      ],
      inputs: {
        pageId: '{{ start.pageId }}',
        description: '{{ start.description }}',
        effectiveDescription: '{{ start.effectiveDescription }}',
      },
      outputs: {
        pageId: '{{ node.pageEntry.page.pageId }}',
        pageNode: 'node.pageEntry.page',
      },
      goal: 'Open the target page through ProjectModel.openPageDesign and normalize the incoming design intent.',
      allowedActions: ['openPageDesign'],
      readableAttributes: ['activePage'],
    }),
    pageDesignStageNode({
      id: 'node.pageInventory',
      title: 'Page File Inventory',
      desc: '100-step stages 11-20: inspect page files and existing rule/data/script/style state.',
      models: [
        modelContext('node.pageInventory.page', 'ConfigPageNode', { sourceRef: 'node.pageEntry.page' }),
        modelContext('node.pageInventory.ruleFile', 'PageRuleFile', {
          sourceRef: 'node.pageInventory.page',
          via: [{ memberName: 'rule', kind: 'attribute', sourceRef: 'node.pageInventory.page' }],
        }),
        modelContext('node.pageInventory.dataSetFile', 'PageDataSetFile', {
          sourceRef: 'node.pageInventory.page',
          via: [{ memberName: 'dataSet', kind: 'attribute', sourceRef: 'node.pageInventory.page' }],
        }),
        modelContext('node.pageInventory.scriptFile', 'PageTextFile', {
          sourceRef: 'node.pageInventory.page',
          via: [{ memberName: 'script', kind: 'attribute', sourceRef: 'node.pageInventory.page' }],
        }),
        modelContext('node.pageInventory.styleFile', 'PageTextFile', {
          sourceRef: 'node.pageInventory.page',
          via: [{ memberName: 'style', kind: 'attribute', sourceRef: 'node.pageInventory.page' }],
        }),
      ],
      inputs: {
        pageNode: '{{ node.pageEntry.pageNode }}',
      },
      outputs: {
        ruleFile: 'node.pageInventory.ruleFile',
        dataSetFile: 'node.pageInventory.dataSetFile',
        scriptFile: 'node.pageInventory.scriptFile',
        styleFile: 'node.pageInventory.styleFile',
      },
      goal: 'Inventory existing page rule, pagedata, script, and style models before planning mutations.',
      allowedActions: ['load', 'toRenderConfig'],
      readableAttributes: ['rule', 'dataSet', 'script', 'style', 'isLoaded'],
    }),
    pageDesignStageNode({
      id: 'node.dataShape',
      title: 'Data Shape Planning',
      desc: '100-step stages 21-40: plan minimal DataSet tables and metadata.',
      models: [
        modelContext('node.dataShape.dataSetFile', 'PageDataSetFile', { sourceRef: 'node.pageInventory.dataSetFile' }),
        modelContext('node.dataShape.dataSet', 'DataSet', {
          sourceRef: 'node.dataShape.dataSetFile',
          via: [{ memberName: 'value', kind: 'attribute', sourceRef: 'node.dataShape.dataSetFile' }],
        }),
        modelContext('node.dataShape.crudTool', 'DataSetCrudTool', {
          sourceRef: 'node.dataShape.dataSet',
          via: [{ memberName: 'fromDataSet', kind: 'method', sourceRef: 'node.dataShape.dataSet' }],
        }),
      ],
      inputs: {
        dataSetFile: '{{ node.pageInventory.dataSetFile }}',
      },
      outputs: {
        dataSet: 'node.dataShape.dataSet',
        tables: '{{ node.dataShape.dataSet.tables }}',
      },
      goal: 'Plan and shape the minimal DataSet tables required by the page design intent.',
      allowedActions: ['fromDataSet', 'createTable', 'updateTable', 'toJson'],
      readableAttributes: ['tables', 'dataSetName', 'schemaVersion'],
    }),
    pageDesignStageNode({
      id: 'node.tableRelations',
      title: 'Table Relations',
      desc: '100-step stages 41-50: connect tables with TableRelation definitions.',
      models: [
        modelContext('node.tableRelations.dataSet', 'DataSet', { sourceRef: 'node.dataShape.dataSet' }),
        modelContext('node.tableRelations.relations', 'TableRelation', {
          sourceRef: 'node.tableRelations.dataSet',
          via: [{ memberName: 'tableRelations', kind: 'attribute', sourceRef: 'node.tableRelations.dataSet' }],
        }),
      ],
      inputs: {
        tables: '{{ node.dataShape.tables }}',
      },
      outputs: {
        tableRelations: '{{ node.tableRelations.dataSet.tableRelations }}',
      },
      goal: 'Design parent-child table relations that preserve DataSet integrity and downstream view usage.',
      allowedActions: ['addRelation', 'updateRelation', 'removeRelation', 'getTableChildRelations', 'getTableParentRelations'],
      readableAttributes: ['tableRelations', 'tables'],
    }),
    pageDesignStageNode({
      id: 'node.viewDesign',
      title: 'Data Views and Dependencies',
      desc: '100-step stages 51-88: plan page data usage, DataViews, and viewDependencies.',
      models: [
        modelContext('node.viewDesign.dataSet', 'DataSet', { sourceRef: 'node.tableRelations.dataSet' }),
        modelContext('node.viewDesign.dataView', 'DataView', {
          sourceRef: 'node.viewDesign.dataSet',
          via: [{ memberName: 'getView', kind: 'method', sourceRef: 'node.viewDesign.dataSet' }],
        }),
        modelContext('node.viewDesign.dependencies', 'ViewDependency', {
          sourceRef: 'node.viewDesign.dataSet',
          via: [{ memberName: 'viewDependencies', kind: 'attribute', sourceRef: 'node.viewDesign.dataSet' }],
        }),
      ],
      inputs: {
        tableRelations: '{{ node.tableRelations.tableRelations }}',
      },
      outputs: {
        dataViews: '{{ node.viewDesign.dataSet.getView }}',
        viewDependencies: '{{ node.viewDesign.dataSet.viewDependencies }}',
      },
      goal: 'Plan renderer-facing DataViews and view dependency links from the shaped DataSet.',
      allowedActions: ['getView', 'createView', 'updateView', 'addDependency', 'updateDependency'],
      readableAttributes: ['viewDependencies', 'tables'],
    }),
    pageDesignStageNode({
      id: 'node.ruleBehaviorAssets',
      title: 'Rule Behavior and Assets',
      desc: '100-step stages 89-96: align structure, behavior, script, and style assets.',
      models: [
        modelContext('node.ruleBehaviorAssets.page', 'ConfigPageNode', { sourceRef: 'node.pageInventory.page' }),
        modelContext('node.ruleBehaviorAssets.ruleFile', 'PageRuleFile', { sourceRef: 'node.pageInventory.ruleFile' }),
        modelContext('node.ruleBehaviorAssets.scriptFile', 'PageTextFile', { sourceRef: 'node.pageInventory.scriptFile' }),
        modelContext('node.ruleBehaviorAssets.styleFile', 'PageTextFile', { sourceRef: 'node.pageInventory.styleFile' }),
      ],
      inputs: {
        dataViews: '{{ node.viewDesign.dataViews }}',
        viewDependencies: '{{ node.viewDesign.viewDependencies }}',
      },
      outputs: {
        rule: '{{ node.ruleBehaviorAssets.page.rule }}',
        script: '{{ node.ruleBehaviorAssets.page.script }}',
        style: '{{ node.ruleBehaviorAssets.page.style }}',
      },
      goal: 'Bind DataSet planning into rule, script, and style assets without inventing runtime behavior outside ClassModel.',
      allowedActions: ['toRenderConfig'],
      readableAttributes: ['rule', 'script', 'style'],
    }),
    pageDesignStageNode({
      id: 'node.renderCloseout',
      title: 'Render Validation and Closeout',
      desc: '100-step stages 97-100: cross-check render config, preview fix loop, and closeout result.',
      models: [
        modelContext('node.renderCloseout.page', 'ConfigPageNode', { sourceRef: 'node.ruleBehaviorAssets.page' }),
      ],
      inputs: {
        rule: '{{ node.ruleBehaviorAssets.rule }}',
        script: '{{ node.ruleBehaviorAssets.script }}',
        style: '{{ node.ruleBehaviorAssets.style }}',
      },
      outputs: {
        renderConfig: '{{ node.renderCloseout.page.toRenderConfig }}',
        result: 'pageDesign.result',
      },
      goal: 'Use ConfigPageNode.toRenderConfig as the final projected render snapshot for preview and closeout.',
      allowedActions: ['toRenderConfig'],
      readableAttributes: ['pageId', 'isLoaded'],
    }),
  ]
  return createWorkflowDesign({
    workflowId,
    title: 'Page Design',
    variables: [
      variable('pageId', 'Page ID', true, stringSchema),
      variable('description', 'Requirement', true, stringSchema),
      variable('effectiveDescription', 'Planning Description', true, stringSchema),
      variable('projectId', 'Project ID', false, stringSchema),
      variable('planningTitle', 'Planning Title', false, stringSchema),
      variable('planningPath', 'Planning Path', false, stringSchema),
      variable('mode', 'Run Mode', false, { type: 'string', enum: ['create', 'update', 'fix'] }),
      variable('allowedOperations', 'Allowed Operations', false, allowedOperationsSchema),
      variable('preserveExistingInteractions', 'Preserve Existing Interactions', false, booleanSchema),
      variable('strictImplGate', 'Strict Implementation Gate', false, booleanSchema),
    ],
    workflowCapability: {
      id: 'page-design.delivery',
      title: 'Page Design Delivery',
      description: 'Coordinate page design input, ClassModel runtime execution, and page file delivery.',
    },
    runtimeBinding: {
        registration: {
          alias: 'pageDesign',
          moduleId: 'pageDesign',
          businessId: 'pageDesign',
        },
        inputContract: {
          identityField: 'pageId',
          messageField: 'description',
          paramsSchema: pageDesignParamsSchema,
          readonlySteps: [
            '策划约束已注入 effectiveDescription（来自 readPlanningProjection）。',
            '业务契约见 ClassModel 知识索引（model_query / model_class_guide / model_action_guide）。',
          ],
        },
        systemPrompt: {
          template: 'pageDesign system prompt is interpolated by app binding.',
          conditionalHints: [
            {
              when: { allowedOperations: 'dataSetOnly' },
              template: 'pageDataDesign preset: only pagedata.json/DataSet changes are allowed.',
            },
          ],
        },
        modelProjectionRef: PROJECT_MODEL_PROJECTION_REF,
        executableRef: PROJECT_MODEL_EXECUTABLE_REF,
        toolLoopNudge: {
          templates: {
            plan_without_tool: 'pageId="{{moduleInstanceId}}"；禁止只输出计划，下一回合必须发起真实 tool_call。',
            execution_phase: 'pageId="{{moduleInstanceId}}"；目录/指南阶段已完成，直接 model_script。',
            model_script_retry: 'pageId="{{moduleInstanceId}}"；按 RECOVERY_HINT 修正后重试 model_script。',
          },
          contextFields: ['moduleInstanceId'],
        },
        beforeFunctionCall: {
          gateRules: [
            { kind: 'pageDesignMutationGate' },
            { kind: 'allowedOperations' },
            {
              kind: 'forbiddenScriptMarkers',
              markers: ['editNodeTree', 'editDataSet', 'setFileText', 'writePageFile'],
            },
          ],
        },
        executionToolNames: ['model_script'],
        planWithoutToolMarkers: ['openpagedesign', 'editnodetree', 'editdataset'],
        resolveInstance: {
          editorSource: 'pageDesign',
          identityField: 'pageId',
        },
      },
    businessNodes,
    lines: createPageDesignLines(),
    outputResult: '{{ node.renderCloseout.result }}',
  })
}

function createProjectPlanningWorkflowDesign() {
  const workflowId = 'agent.workflow.projectPlanning'
  return createWorkflowDesign({
    workflowId,
    title: 'Project Planning',
    variables: [
      variable('projectScopeKey', 'Project Scope Key', true, stringSchema),
      variable('projectId', 'Project ID', true, stringSchema),
      variable('requirement', 'Project Requirement', true, stringSchema),
      variable('blueprintNodes', 'Project Blueprint Planning Nodes', true, projectPlanningParamsSchema.properties.blueprintNodes),
      variable('tenantId', 'Tenant ID', false, stringSchema),
      variable('planningAttachmentRef', 'Planning Attachment Ref', false, stringSchema),
    ],
    workflowCapability: {
      id: 'project-planning.delivery',
      title: 'Project Planning Delivery',
      description: 'Coordinate project planning input, ClassModel runtime execution, and project blueprint delivery.',
    },
    businessNode: {
      id: 'node.projectPlanning',
      title: 'Project Planning Module',
      inputs: {
        projectScopeKey: '{{ start.projectScopeKey }}',
        projectId: '{{ start.projectId }}',
        requirement: '{{ start.requirement }}',
        blueprintNodes: '{{ start.blueprintNodes }}',
      },
      outputs: {
        result: 'projectPlanning.result',
      },
      llm: {
        task: {
          goal: 'Compose the complete project blueprint from requirements and existing blueprint inputs.',
          requirements: {
            projectScopeKey: '{{ start.projectScopeKey }}',
            projectId: '{{ start.projectId }}',
            requirement: '{{ start.requirement }}',
            blueprintNodes: '{{ start.blueprintNodes }}',
          },
          contextInputs: {
            projectRequirement: '{{ start.requirement }}',
            blueprintNodes: '{{ start.blueprintNodes }}',
          },
        },
        knowledge: {
          rootClassName: 'ProjectModel',
          className: 'ProjectModel',
          allowedActions: [
            'readProjectPlanningInput',
            'readBlueprintPlanningInputs',
            'replaceBlueprintChildren',
            'completeProjectPlanning',
          ],
          readableAttributes: ['blueprintTree'],
        },
        functionCalling: {
          mode: 'freeWithinModelContext',
          constraints: [
            'Runtime binding owns ClassModel knowledge lookup, script generation, and project blueprint mutation.',
            'Completion must go through completeProjectPlanning via agent_complete.',
          ],
        },
        output: {
          structuredResult: {
            result: 'projectPlanning.result',
          },
          handoffToValidation: true,
        },
      },
      validation: {
        action: {
          className: 'ProjectModel',
          actionName: 'completeProjectPlanning',
          inputProjection: {
            summary: '{{ node.projectPlanning.result.summary }}',
          },
          expectedResult: {
            completed: true,
          },
        },
        status: 'draft',
        issues: [],
      },
      runtimeBinding: {
        registration: {
          alias: 'projectPlanning',
          moduleId: 'projectPlanning',
          businessId: 'projectPlanning',
        },
        inputContract: {
          identityField: 'projectScopeKey',
          messageField: 'requirement',
          paramsSchema: projectPlanningParamsSchema,
          readonlySteps: [
            '策划输入已注入 requirement 与 blueprintNodes。',
            '业务契约见 DTS ClassModel 知识索引（model_query / model_action_guide）。',
          ],
        },
        systemPrompt: {
          template: 'projectPlanning system prompt is interpolated by app binding.',
          conditionalHints: [],
        },
        modelProjectionRef: PROJECT_MODEL_PROJECTION_REF,
        executableRef: PROJECT_MODEL_EXECUTABLE_REF,
        toolLoopNudge: {
          templates: {
            plan_without_tool: 'projectId="{{moduleInstanceId}}"；禁止只输出计划，下一回合必须发起 tool_call。',
            execution_phase: 'projectId="{{moduleInstanceId}}"；目录/指南阶段已完成，直接 model_script。',
            model_script_retry: 'projectId="{{moduleInstanceId}}"；按 RECOVERY_HINT 修正后重试 model_script。',
          },
          contextFields: ['moduleInstanceId'],
        },
        beforeFunctionCall: {
          gateRules: [
            { kind: 'projectPlanningToolGate' },
            { kind: 'projectActionLookup' },
            {
              kind: 'forbiddenScriptMarkers',
              markers: ['openPageDesign', 'writePageFile', 'setFileText', 'editNodeTree', 'editDataSet'],
            },
          ],
        },
        executionToolNames: ['model_script'],
        planWithoutToolMarkers: [
          'readplanningprojection',
          'readblueprintplanninginputs',
          'replaceblueprintchildren',
          'readprojectplanninginput',
        ],
        agentCompleteMethodName: 'completeProjectPlanning',
        resolveInstance: {
          editorSource: 'projectPlanning',
          identityField: 'projectScopeKey',
        },
      },
      capability: {
        id: 'project-planning.compose',
        title: 'Compose Project Plan',
        description: 'Let projectPlanning inspect model knowledge and produce complete project blueprint changes through runtime tools.',
        inputs: {
          projectScopeKey: '{{ start.projectScopeKey }}',
          projectId: '{{ start.projectId }}',
          requirement: '{{ start.requirement }}',
          blueprintNodes: '{{ start.blueprintNodes }}',
        },
        outputs: {
          result: 'projectPlanning.result',
        },
      },
      outputResult: '{{ node.projectPlanning.result }}',
    },
  })
}

function pageDesignStageNode(command) {
  return {
    id: command.id,
    title: command.title,
    desc: command.desc,
    models: command.models,
    inputs: command.inputs,
    outputs: command.outputs,
    llm: createNodeLlm({
      goal: command.goal,
      requirements: command.inputs,
      contextInputs: command.inputs,
      className: command.models[0]?.className ?? 'ProjectModel',
      allowedActions: command.allowedActions,
      readableAttributes: command.readableAttributes,
      resultRef: command.outputs.result ?? command.outputs.renderConfig ?? command.outputs.pageNode ?? command.id,
    }),
    validation: {
      status: 'draft',
      issues: [
        {
          level: 'warn',
          code: 'COMPLETION_MEMBER_NOT_BOUND',
          message: 'No projected no-arg completion member exists for this page design stage yet.',
        },
      ],
    },
    capability: {
      id: `${command.id.replace(/^node\./u, 'page-design.')}.stage`,
      title: command.title,
      description: command.desc,
      inputs: command.inputs,
      outputs: command.outputs,
    },
  }
}

function createNodeLlm(command) {
  return {
    task: {
      goal: command.goal,
      requirements: command.requirements,
      contextInputs: command.contextInputs,
    },
    knowledge: {
      rootClassName: 'ProjectModel',
      className: command.className,
      allowedActions: command.allowedActions,
      readableAttributes: command.readableAttributes,
    },
    functionCalling: {
      mode: 'freeWithinModelContext',
      constraints: [
        'Node declares model context and member-level IO only; runtime knowledge/function orchestration stays in the registered binding.',
      ],
    },
    output: {
      structuredResult: {
        result: command.resultRef,
      },
      handoffToValidation: true,
    },
  }
}

function modelContext(id, className, options = {}) {
  return {
    id,
    rootClassName: 'ProjectModel',
    className,
    sourceRef: options.sourceRef ?? '$',
    ...(options.via === undefined ? {} : { via: options.via }),
    ...(options.role === undefined ? {} : { role: options.role }),
    ...(options.completion === undefined ? {} : { completion: options.completion }),
  }
}

function completion(memberName) {
  return {
    memberName,
    returnContract: 'boolean-or-reason',
  }
}

function completionFromValidation(validation) {
  const memberName = validation?.action?.actionName
  return typeof memberName === 'string' && memberName.length > 0 ? completion(memberName) : undefined
}

function workflowLine(id, fromNodeId, fromModelId, fromMemberName, toNodeId, toModelId, toMemberName, relation = 'sequence') {
  return {
    id,
    from: {
      nodeId: fromNodeId,
      modelId: fromModelId,
      memberName: fromMemberName,
    },
    to: {
      nodeId: toNodeId,
      modelId: toModelId,
      memberName: toMemberName,
    },
    type: 'custom',
    data: {
      relation,
      branch: {
        label: relation,
        default: relation === 'sequence',
      },
      validation: {},
    },
  }
}

function createPageDesignLines() {
  return [
    workflowLine('line.start.pageId', 'start', '$workflow', 'pageId', 'node.pageEntry', 'node.pageEntry.project', 'openPageDesign'),
    workflowLine('line.start.description', 'start', '$workflow', 'description', 'node.pageEntry', 'node.pageEntry.project', 'openPageDesign'),
    workflowLine('line.start.effectiveDescription', 'start', '$workflow', 'effectiveDescription', 'node.pageEntry', 'node.pageEntry.project', 'openPageDesign'),
    workflowLine('line.pageEntry.pageId', 'node.pageEntry', 'node.pageEntry.page', 'pageId', 'node.pageInventory', 'node.pageInventory.page', 'pageId'),
    workflowLine('line.inventory.dataSet', 'node.pageInventory', 'node.pageInventory.page', 'dataSet', 'node.dataShape', 'node.dataShape.dataSetFile', 'value'),
    workflowLine('line.inventory.rule', 'node.pageInventory', 'node.pageInventory.page', 'rule', 'node.ruleBehaviorAssets', 'node.ruleBehaviorAssets.ruleFile', 'value'),
    workflowLine('line.inventory.script', 'node.pageInventory', 'node.pageInventory.page', 'script', 'node.ruleBehaviorAssets', 'node.ruleBehaviorAssets.scriptFile', 'js'),
    workflowLine('line.inventory.style', 'node.pageInventory', 'node.pageInventory.page', 'style', 'node.ruleBehaviorAssets', 'node.ruleBehaviorAssets.styleFile', 'css'),
    workflowLine('line.dataShape.tables', 'node.dataShape', 'node.dataShape.dataSet', 'tables', 'node.tableRelations', 'node.tableRelations.dataSet', 'tables'),
    workflowLine('line.dataShape.tableRelations', 'node.dataShape', 'node.dataShape.dataSet', 'tableRelations', 'node.tableRelations', 'node.tableRelations.relations', 'tableRelations'),
    workflowLine('line.relations.getView', 'node.tableRelations', 'node.tableRelations.dataSet', 'getView', 'node.viewDesign', 'node.viewDesign.dataView', 'getView'),
    workflowLine('line.relations.viewDependencies', 'node.tableRelations', 'node.tableRelations.dataSet', 'viewDependencies', 'node.viewDesign', 'node.viewDesign.dependencies', 'viewDependencies'),
    workflowLine('line.viewDesign.rule', 'node.viewDesign', 'node.viewDesign.dataSet', 'getView', 'node.ruleBehaviorAssets', 'node.ruleBehaviorAssets.page', 'rule'),
    workflowLine('line.ruleBehavior.render', 'node.ruleBehaviorAssets', 'node.ruleBehaviorAssets.page', 'rule', 'node.renderCloseout', 'node.renderCloseout.page', 'toRenderConfig'),
    workflowLine('line.render.output', 'node.renderCloseout', 'node.renderCloseout.page', 'toRenderConfig', 'output', '$workflow', 'result'),
  ]
}

function createSequentialWorkflowLines(node) {
  const modelId = node.models?.[0]?.id ?? `${node.id}.model`
  return [
    ...Object.keys(node.inputs ?? {}).map((inputName) => {
      return workflowLine(`line.start.${inputName}`, 'start', '$workflow', inputName, node.id, modelId, inputName)
    }),
    workflowLine('line.node.output', node.id, modelId, 'result', 'output', '$workflow', 'result'),
  ]
}

function createWorkflowDesign(command) {
  const businessNodes = command.businessNodes ?? [command.businessNode]
  return {
    kind: 'agent.workflow.design',
    version: 1,
    id: command.workflowId,
    workflow: {
      id: command.workflowId,
      version: 1,
      variables: command.variables,
      runtimeBinding: command.runtimeBinding ?? command.businessNode?.runtimeBinding,
      capabilities: [
        {
          ...command.workflowCapability,
          scope: 'workflow',
          constraints: [
            'Workflow definition declares runtime binding; app layer injects executable capabilities.',
          ],
        },
      ],
      graph: {
        id: `${command.workflowId}.graph`,
        nodes: [
          {
            id: 'start',
            type: 'start',
            data: {
              type: 'start',
              title: 'Start',
            },
          },
          ...businessNodes.map((node, index) => createBusinessGraphNode(node, index, businessNodes.length)),
          {
            id: 'output',
            type: 'output',
            data: {
              type: 'output',
              title: 'Output',
              outputs: {
                result: command.outputResult ?? command.businessNode?.outputResult,
              },
              capabilities: [],
            },
          },
        ],
        lines: command.lines ?? createSequentialWorkflowLines(command.businessNode),
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.design.v1',
      designer: {
        title: command.title,
      },
      draft: {
        status: 'saved',
        dirtyPaths: [],
      },
      validation: {
        status: 'valid',
        issues: [],
      },
    },
  }
}

function createBusinessGraphNode(node, index, total) {
  const models = node.models ?? [
    modelContext(`${node.id}.model`, 'ProjectModel', {
      completion: completionFromValidation(node.validation),
    }),
  ]
  return {
    id: node.id,
    type: 'node',
    data: {
      type: 'node',
      title: node.title,
      desc: node.desc,
      models,
      inputs: node.inputs,
      outputs: node.outputs,
      llm: node.llm,
      validation: node.validation,
      state: {},
      result: {},
      capabilities: [
        {
          ...node.capability,
          scope: 'node',
          constraints: [
            'Workflow definition names the models and member-level data flow; runtime chooses ClassModel actions and script calls.',
          ],
        },
      ],
    },
    position: {
      x: Math.round(((index + 1) * 720) / Math.max(1, total + 1)),
      y: 40 + (index % 2) * 180,
    },
  }
}

function variable(name, title, required, schema) {
  return { name, title, required, schema }
}

await main()
