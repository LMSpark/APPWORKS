/**
 * workflow 正式 PK BatchTableOperate 公共载荷（Tier A/B 共用）。
 */
import {buildSparkAuthHeaders, WORKFLOW_METADATA_DESIGN_FORM_KEY} from './spark-http-headers.mjs'
import {formalRowId} from './workflow-metadata-models.mjs'

export const BATCH_PATH = '/api/DataOperation/BatchTableOperateRequestByCRUD'

export function buildModelChangedRow(sourceRow, primaryKeyFields = 'rowid') {
  const rowid = formalRowId(sourceRow)
  const changed = {
    rowid,
    Name: sourceRow.Name ?? sourceRow.name,
    MetaName: sourceRow.MetaName ?? sourceRow.metaName,
    dataSetId: sourceRow.dataSetId ?? sourceRow.DataSetId,
    Type: sourceRow.Type ?? sourceRow.type,
    DbId: sourceRow.DbId ?? sourceRow.dbId,
    PrimaryKeyFields: primaryKeyFields,
  }
  if (sourceRow.lingma_sys_key) changed.lingma_sys_key = sourceRow.lingma_sys_key
  return changed
}

export function buildFieldChangedRow(sourceRow, patch) {
  const rowid = formalRowId(sourceRow)
  const changed = {
    rowid,
    Name: sourceRow.Name ?? sourceRow.name,
    dataModelId: sourceRow.dataModelId ?? sourceRow.DataModelId,
    type: sourceRow.type ?? sourceRow.Type ?? 'dataModel',
    ...patch,
  }
  if (sourceRow.lingma_sys_key) changed.lingma_sys_key = sourceRow.lingma_sys_key
  return changed
}

export async function postBatchTableOperate(ctx, tableName, changedRows, formKey = WORKFLOW_METADATA_DESIGN_FORM_KEY) {
  const headers = {...buildSparkAuthHeaders(ctx), 'x-FormKey': formKey}
  const body = [
    {
      TableName: tableName,
      CrudModel: {Added: [], Changed: changedRows, Deleted: []},
    },
  ]
  const response = await fetch(`${ctx.baseUrl}${BATCH_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const json = await response.json()
  return {httpStatus: response.status, code: json?.Code, message: json?.Message, result: json?.Result, formKey}
}