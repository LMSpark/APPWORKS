import {AGENT_WORKFLOW_DESIGN_TABLES} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-design-resource'

/** Scenario table declarations for the five design projection tables, as the data-space designer stores them. */
export function agentWorkflowDesignTables(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(AGENT_WORKFLOW_DESIGN_TABLES.map(table => [table.tableName, {
    resourceType: 'file', resourceId: table.resourceId, columns: table.columns.map(column => ({...column})),
    views: Object.fromEntries(Object.entries(table.views).map(([viewId, config]) => [viewId, structuredClone({...config})])),
  }]))
}
