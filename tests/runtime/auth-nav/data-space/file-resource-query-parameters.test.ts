import {describe, expect, it} from 'vitest'
import {fileResourceQueryParameters} from '@/lowcode/resources/shared/file-resource-query-parameters'
import {AGENT_WORKFLOW_FILE_RESOURCE_ID, LOWCODE_FILE_RESOURCE_REGISTRY} from '@/lowcode/resources/shared/agent-workflow-file-resource'

describe('file resource query parameter ownership', () => {
  it('does not route a registered resource through the scenario-definition contract', () => {
    expect(fileResourceQueryParameters(AGENT_WORKFLOW_FILE_RESOURCE_ID, 'directory')).toEqual([])
    expect(fileResourceQueryParameters(AGENT_WORKFLOW_FILE_RESOURCE_ID, 'default')).toEqual([])
    expect(fileResourceQueryParameters(AGENT_WORKFLOW_FILE_RESOURCE_ID, 'design')).toEqual([
      {name: 'workflowId', type: 'string', label: '工作流 ID', required: true},
    ])
    expect(fileResourceQueryParameters(AGENT_WORKFLOW_FILE_RESOURCE_ID, 'definition')).toEqual([
      {name: 'workflowId', type: 'string', label: '工作流 ID', required: true},
    ])
  })

  it('fails closed for an unregistered file resource identity', () => {
    expect(() => fileResourceQueryParameters('not-registered', 'default')).toThrow('SCENARIO_DEFINITION_IDENTITY')
  })

  it('rejects a view that is not declared by the registered resource', () => {
    expect(() => fileResourceQueryParameters(AGENT_WORKFLOW_FILE_RESOURCE_ID, 'missing')).toThrow('FILE_RESOURCE_VIEW_IDENTITY')
  })

  it('declares parameter fields for every view and keeps them aligned with queryContext keys', () => {
    for (const resource of LOWCODE_FILE_RESOURCE_REGISTRY) {
      expect(Object.keys(resource.queryParameters).sort()).toEqual(Object.keys(resource.views).sort())
      for (const [viewId, config] of Object.entries(resource.views)) {
        const context = config['queryContext']
        const contextKeys = context && typeof context === 'object' && !Array.isArray(context) ? Object.keys(context) : []
        expect(resource.queryParameters[viewId]?.map(parameter => parameter.name).sort()).toEqual(contextKeys.sort())
      }
    }
  })
})
