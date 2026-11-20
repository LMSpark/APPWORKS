import { describe, expect, it } from 'vitest'

import {
  collectNestedApiRecords,
  walkAiApiMetadataGraph,
  type AiApiObjectMetadata,
} from '../../class-model'

const CHILD_VIA_ACTION: AiApiObjectMetadata = {
  kind: 'config-page',
  name: 'Config Page',
  description: 'Page editor API',
  actions: [{
    name: 'editNodeTree',
    methodName: 'editNodeTree',
    description: 'Edit node tree',
    paramsSchema: { type: 'object', properties: {}, required: [] },
  }],
}

const CHILD_VIA_ATTR: AiApiObjectMetadata = {
  kind: 'dataset',
  name: 'DataSet',
  description: 'Dataset API',
  actions: [{
    name: 'createTable',
    methodName: 'createTable',
    description: 'Create table',
    paramsSchema: { type: 'object', properties: {}, required: [] },
  }],
}

const ROOT: AiApiObjectMetadata = {
  kind: 'project',
  name: 'Project',
  description: 'Root project API',
  attributes: [{
    name: 'activeDataSet',
    description: 'Active dataset handle',
    schema: { type: 'object' },
    readable: true,
    writable: false,
    api: CHILD_VIA_ATTR,
  }],
  actions: [{
    name: 'openPageDesign',
    methodName: 'openPageDesign',
    description: 'Open page design',
    paramsSchema: { type: 'object', properties: { pageId: { type: 'string' } }, required: ['pageId'] },
    resultApis: [{ resultPath: [], api: CHILD_VIA_ACTION }],
  }],
}

describe('metadata-graph', () => {
  it('walks model -> attribute|action -> child submodule edges', () => {
    const nodes = walkAiApiMetadataGraph(ROOT)
    const root = nodes[0]
    expect(root?.api.kind).toBe('project')
    expect(root?.edges).toHaveLength(2)
    expect(root?.edges.some(edge => edge.via === 'attribute' && edge.viaName === 'activeDataSet' && edge.child.kind === 'dataset')).toBe(true)
    expect(root?.edges.some(edge => edge.via === 'action' && edge.viaName === 'openPageDesign' && edge.child.kind === 'config-page')).toBe(true)
  })

  it('collectNestedApiRecords dedupes by kind and keeps first parent', () => {
    const records = collectNestedApiRecords(ROOT)
    expect(records.map(record => record.api.kind).sort()).toEqual(['config-page', 'dataset'])
    const page = records.find(record => record.api.kind === 'config-page')
    expect(page?.parentKind).toBe('project')
    expect(page?.via).toBe('action')
    expect(page?.viaName).toBe('openPageDesign')
  })
})
