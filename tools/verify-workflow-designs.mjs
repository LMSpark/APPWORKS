#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const WORKFLOW_ROOT = path.resolve(
  import.meta.dirname,
  '..',
  'config',
  'agent-workflows',
  'lmspark',
  'homepage',
)

const REQUIRED_WORKFLOW_IDS = [
  'agent.workflow.pageDesign',
  'agent.workflow.projectPlanning',
]

const FORBIDDEN_WORKFLOW_IDS = [
  'agent.workflow.20260615130850',
  'agent.workflow.20260615130928',
]

const LEGACY_KEYS = [
  'features',
  'environment_variables',
  'conversation_variables',
  'provider',
  'toolName',
  'workflowRef',
  'toolParameters',
  'inputMapping',
  'outputMapping',
  'x_spark.classModel',
]

const errors = []

async function main() {
  const entries = await readdir(WORKFLOW_ROOT, { withFileTypes: true })
  const workflowIds = new Set(entries.filter(entry => entry.isDirectory()).map(entry => entry.name))
  for (const workflowId of REQUIRED_WORKFLOW_IDS) {
    if (!workflowIds.has(workflowId)) {
      errors.push(`Missing workflow directory: ${workflowId}`)
      continue
    }
    await verifyWorkflow(workflowId)
  }
  for (const workflowId of FORBIDDEN_WORKFLOW_IDS) {
    if (workflowIds.has(workflowId)) {
      errors.push(`Legacy workflow directory must be removed: ${workflowId}`)
    }
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`workflow-designs: ${error}`)
    process.exit(1)
  }
}

async function verifyWorkflow(workflowId) {
  const directory = path.join(WORKFLOW_ROOT, workflowId)
  const design = await readJson(path.join(directory, 'design.json'))
  const definition = await readJson(path.join(directory, 'definition.json'))
  verifyDesign(workflowId, design)
  verifyDefinition(workflowId, definition)
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    errors.push(`Cannot read JSON ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function verifyDesign(workflowId, design) {
  if (!isRecord(design)) return
  expectEqual(design.kind, 'agent.workflow.design', `${workflowId} design.kind`)
  expectEqual(design.id, workflowId, `${workflowId} design.id`)
  expectEqual(design.workflow?.id, workflowId, `${workflowId} design.workflow.id`)
  verifyRuntimeBinding(workflowId, design.workflow?.runtimeBinding, 'design')
  verifyGraph(workflowId, design.workflow?.graph, 'design')
  verifyNoRefs(workflowId, design, 'design')
  verifyNoLegacyKeys(workflowId, design, 'design')
}

function verifyDefinition(workflowId, definition) {
  if (!isRecord(definition)) return
  expectEqual(definition.kind, 'agent.workflow', `${workflowId} definition.kind`)
  expectEqual(definition.workflowId, workflowId, `${workflowId} definition.workflowId`)
  expectEqual(definition.source?.designId, workflowId, `${workflowId} definition.source.designId`)
  verifyRuntimeBinding(workflowId, definition.workflow?.runtimeBinding, 'definition')
  verifyGraph(workflowId, definition.workflow?.graph, 'definition')
  verifyNoRefs(workflowId, definition, 'definition')
  verifyNoLegacyKeys(workflowId, definition, 'definition')
}

function verifyGraph(workflowId, graph, label) {
  if (!isRecord(graph)) {
    errors.push(`${workflowId} ${label}.workflow.graph must be an object`)
    return
  }
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const lines = Array.isArray(graph.lines) ? graph.lines : []
  const expectedBusinessNodeCount = workflowId === 'agent.workflow.pageDesign' ? 7 : 1
  const expectedLineCount = workflowId === 'agent.workflow.pageDesign' ? 15 : 5
  expectEqual(nodes.length, expectedBusinessNodeCount + 2, `${workflowId} ${label}.nodes.length`)
  expectEqual(lines.length, expectedLineCount, `${workflowId} ${label}.lines.length`)
  expectEqual(nodes[0]?.type, 'start', `${workflowId} ${label}.nodes[0].type`)
  expectEqual(nodes.at(-1)?.type, 'output', `${workflowId} ${label}.nodes[last].type`)
  for (const node of nodes.slice(1, -1)) {
    expectEqual(node.type, 'node', `${workflowId} ${label}.${node.id}.type`)
    verifyBusinessNode(workflowId, node, label)
  }
  for (const line of lines) {
    verifyLine(workflowId, line, label)
  }
  if (Object.prototype.hasOwnProperty.call(graph, 'edges')) {
    errors.push(`${workflowId} ${label}.workflow.graph must not contain legacy edges`)
  }
}

function verifyBusinessNode(workflowId, node, label) {
  const data = node?.data
  if (!isRecord(data)) {
    errors.push(`${workflowId} ${label}.${node?.id}.data must be an object`)
    return
  }
  if (!Array.isArray(data.models) || data.models.length === 0) {
    errors.push(`${workflowId} ${label}.${node.id}.data.models must be a non-empty array`)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'model')) {
    errors.push(`${workflowId} ${label}.${node.id}.data must not contain legacy model`)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'runtimeBinding')) {
    errors.push(`${workflowId} ${label}.${node.id}.data must not contain node runtimeBinding`)
  }
}

function verifyLine(workflowId, line, label) {
  if (!isRecord(line)) {
    errors.push(`${workflowId} ${label}.line must be an object`)
    return
  }
  for (const side of ['from', 'to']) {
    const endpoint = line[side]
    if (!isRecord(endpoint)) {
      errors.push(`${workflowId} ${label}.${line.id}.${side} must be an object`)
      continue
    }
    for (const field of ['nodeId', 'modelId', 'memberName']) {
      if (typeof endpoint[field] !== 'string' || endpoint[field].trim().length === 0) {
        errors.push(`${workflowId} ${label}.${line.id}.${side}.${field} must be a non-empty string`)
      }
    }
  }
}

function verifyRuntimeBinding(workflowId, runtimeBinding, label) {
  if (!isRecord(runtimeBinding)) {
    errors.push(`${workflowId} ${label}.businessNode.runtimeBinding must be an object`)
    return
  }
  for (const pathSuffix of [
    'registration.alias',
    'registration.moduleId',
    'registration.businessId',
    'inputContract.identityField',
    'inputContract.messageField',
    'systemPrompt.template',
    'modelProjectionRef.kind',
    'modelProjectionRef.rootClassName',
    'modelProjectionRef.manifestUrlRef',
    'executableRef.kind',
    'executableRef.moduleSpecifier',
    'executableRef.exportName',
    'resolveInstance.editorSource',
    'resolveInstance.identityField',
  ]) {
    const value = readPath(runtimeBinding, pathSuffix)
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${workflowId} ${label}.runtimeBinding.${pathSuffix} must be a non-empty string`)
    }
  }
  expectEqual(
    readPath(runtimeBinding, 'modelProjectionRef.kind'),
    'dts-class-model',
    `${workflowId} ${label}.runtimeBinding.modelProjectionRef.kind`,
  )
  expectEqual(
    readPath(runtimeBinding, 'executableRef.kind'),
    'js-module',
    `${workflowId} ${label}.runtimeBinding.executableRef.kind`,
  )
  for (const field of ['knowledge', 'moduleClassRef']) {
    if (Object.prototype.hasOwnProperty.call(runtimeBinding, field)) {
      errors.push(`${workflowId} ${label}.runtimeBinding must not contain legacy field ${field}`)
    }
  }
  if (!isRecord(runtimeBinding.inputContract?.paramsSchema)) {
    errors.push(`${workflowId} ${label}.runtimeBinding.inputContract.paramsSchema must be an object`)
  }
  if (!Array.isArray(runtimeBinding.beforeFunctionCall?.gateRules)) {
    errors.push(`${workflowId} ${label}.runtimeBinding.beforeFunctionCall.gateRules must be an array`)
  }
}

function verifyNoRefs(workflowId, value, label) {
  walk(value, (currentPath, currentValue) => {
    if (currentPath.endsWith('$ref')) {
      errors.push(`${workflowId} ${label} must not contain $ref at ${currentPath}`)
    }
    if (isRecord(currentValue) && typeof currentValue.x_spark?.schemaRef === 'string') {
      errors.push(`${workflowId} ${label} must not contain x_spark.schemaRef at ${currentPath}.x_spark.schemaRef`)
    }
  })
}

function verifyNoLegacyKeys(workflowId, value, label) {
  walk(value, (currentPath) => {
    for (const key of LEGACY_KEYS) {
      if (currentPath === key || currentPath.endsWith(`.${key}`)) {
        errors.push(`${workflowId} ${label} must not contain legacy field ${currentPath}`)
      }
    }
  })
}

function walk(value, visit, currentPath = '') {
  visit(currentPath, value)
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${currentPath}[${index}]`))
    return
  }
  if (!isRecord(value)) return
  for (const [key, field] of Object.entries(value)) {
    walk(field, visit, currentPath.length === 0 ? key : `${currentPath}.${key}`)
  }
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function readPath(record, pathSuffix) {
  return pathSuffix.split('.').reduce((value, key) => {
    if (!isRecord(value)) return undefined
    return value[key]
  }, record)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

await main()
