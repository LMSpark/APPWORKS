import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'

const root = process.cwd()

type PagedataDoc = {
  tables?: Record<string, {modelBinding?: {modelId?: string; modelName?: string}}>
}

function readPagedata(path: string): PagedataDoc {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as PagedataDoc
}

const bindingCases = [
  {
    file: 'config/pages/workflow/flow-model-list/pagedata.json',
    tables: ['WFM_FLOW_MODLE'],
  },
  {
    file: 'config/pages/workflow/flow-design/pagedata.json',
    tables: [
      'WFM_FLOW_MODLE',
      'WFM_FLOW_NODE',
      'WFM_NODE_REALATION',
      'WFM_WORKFORM',
      'FunctionNodeAuth',
      '_Base_FunctionNode',
    ],
  },
] as const

describe('workflow pagedata G0 modelBinding', () => {
  for (const entry of bindingCases) {
    it(`${entry.file} exposes modelId for formal models`, () => {
      const doc = readPagedata(entry.file)
      for (const tableName of entry.tables) {
        const binding = doc.tables?.[tableName]?.modelBinding
        expect(binding?.modelName, `${tableName} modelName`).toBe(tableName)
        expect(binding?.modelId, `${tableName} modelId after G0`).toMatch(/^[0-9A-Za-z-]{8,}$/)
      }
    })
  }
})
it('binds workflow catalog status to the formal dictionary option view', () => {
  const doc = readPagedata('config/pages/structured-config/workflow-catalog/pagedata.json')
  expect(doc.tables?.['Base_WorkflowDefinition']).toMatchObject({
    columns: expect.arrayContaining([{name: 'status', required: true,
      optionsView: {tableName: 'workflowStatus', valueField: 'statusCode'}}]),
  })
  expect(doc.tables?.['workflowStatus']).toMatchObject({
    modelBinding: {modelId: expect.any(String), modelName: 'workflowStatus'},
    views: {default: {valueField: 'statusCode', labelField: 'txt'}},
  })
})
