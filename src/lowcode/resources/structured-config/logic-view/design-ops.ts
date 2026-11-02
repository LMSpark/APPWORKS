/**
 * @module app:lowcode/resources/structured-config/logic-view/design-ops
 */
import {LogicViewDesignClient} from '@spark-appworks/spark-lowcode-api'
import type {DataSet} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {attachStagedDesignView, parseJsonValue} from '../../repository/staged-design-file-view'

export const LOGIC_VIEW_DESIGN_INPUT = 'LogicViewDesignInput'
export const LOGIC_VIEW_DESIGN_VIEW = 'LogicViewDesignEdit'

export function attachLogicViewDesignEdit(options: Readonly<{dataSet: DataSet; http: HttpClientBase; guard: () => void;
  readScope: ConstructorParameters<typeof LogicViewDesignClient>[1]['readScope']}>): void {
  const {dataSet, http, guard, readScope} = options
  const scenarioId = dataSet.scenarioId
  if (!scenarioId?.trim()) throw new Error('逻辑视图设计缺少所属正式场景')
  const client = new LogicViewDesignClient(http, {scenarioId, readScope})
  attachStagedDesignView(dataSet, {
    scopeInputTable: LOGIC_VIEW_DESIGN_INPUT,
    scopeField: 'viewId',
    designViewTable: LOGIC_VIEW_DESIGN_VIEW,
    resourceId: 'logic-view-design',
    jsonFields: ['designJson'],
    columns: [{name: 'rowid', primary: true}, {name: 'viewId'}, {name: 'designJson'}],
    loadRow: async viewId => {
      const payload = await client.read(viewId)
      return {rowid: viewId, viewId, designJson: JSON.stringify(payload.data, null, 2)}
    },
    persistRow: async row => {
      const viewId = String(row['viewId'] ?? row['rowid'] ?? '')
      const raw = String(row['designJson'] ?? '')
      const data = parseJsonValue(raw, [])
      await client.write({viewId, data})
    },
  }, guard)
}
