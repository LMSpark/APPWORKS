/**
 * @module app:lowcode/resources/structured-config/workflow-definition/design-ops
 */
import {WorkflowDesignClient} from '@spark-appworks/spark-lowcode-api'
import type {DataSet} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {attachStagedDesignView, parseJsonObject, readJsonArray} from '../../repository/staged-design-file-view'

export const WORKFLOW_DESIGN_INPUT = 'WorkflowDesignInput'
export const WORKFLOW_DESIGN_VIEW = 'WorkflowDesignEdit'

export function attachWorkflowDesignEdit(dataSet: DataSet, http: HttpClientBase, guard: () => void): void {
  const client = new WorkflowDesignClient(http)
  attachStagedDesignView(dataSet, {
    scopeInputTable: WORKFLOW_DESIGN_INPUT,
    scopeField: 'workflowId',
    designViewTable: WORKFLOW_DESIGN_VIEW,
    resourceId: 'workflow-definition-design',
    jsonFields: ['designJson'],
    columns: [{name: 'rowid', primary: true}, {name: 'workflowId'}, {name: 'designJson'}],
    loadRow: async workflowId => {
      const doc = await client.read(workflowId)
      return {rowid: workflowId, workflowId, designJson: JSON.stringify({nodes: doc.nodes, connectors: doc.connectors}, null, 2)}
    },
    persistRow: async row => {
      const workflowId = String(row['workflowId'] ?? row['rowid'] ?? '')
      const raw = String(row['designJson'] ?? '{}')
      const parsed = parseJsonObject(raw)
      await client.write({workflowId, nodes: readJsonArray(parsed, 'nodes'), connectors: readJsonArray(parsed, 'connectors')})
    },
  }, guard)
}
