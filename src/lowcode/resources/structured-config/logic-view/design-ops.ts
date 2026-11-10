/**
 * @module app:lowcode/resources/structured-config/logic-view/design-ops
 * 职责：逻辑视图设计 JSON 的文件资源执行器；表与视图由逻辑视图目录场景 pagedata 正式声明。
 * 边界：读写只经 GetView/SaveView；编辑授权取本次目录 editorTarget 的正式编辑状态。
 */
import {LogicViewDesignClient} from '@spark-appworks/spark-lowcode-api'
import type {DataView} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {createStagedDesignExecutor, parseJsonValue} from '../../repository/staged-design-file-view'

export const LOGIC_VIEW_DESIGN_VIEW = 'LogicViewDesignEdit'
export const LOGIC_VIEW_DESIGN_RESOURCE_ID = 'logic-view-design'

type LogicViewDesignExecutorInput = Readonly<{
  /** 设计目录所在的正式场景，作为 GetView/SaveView 的 X-FormKey。 */
  scenarioId: string
  http: HttpClientBase
  guard: () => void
  readScope: ConstructorParameters<typeof LogicViewDesignClient>[1]['readScope']
}>

function editorTargetAllows(viewId: string, view: DataView): boolean {
  const catalog = view.dataSet?.getView('Base_DataViewList', 'editorTarget')
  const row = catalog?.rows.find(item => catalog.getPkKey(item) === viewId)
  return !!catalog && !!row && catalog.editActionState(row) === 'enabled'
}

export function createLogicViewDesignExecutor(input: LogicViewDesignExecutorInput): ReturnType<typeof createStagedDesignExecutor> {
  const {scenarioId, http, guard, readScope} = input
  if (!scenarioId.trim()) throw new Error('逻辑视图设计缺少所属正式场景')
  const client = new LogicViewDesignClient(http, {scenarioId, readScope})
  return createStagedDesignExecutor({
    scopeField: 'viewId',
    resourceId: LOGIC_VIEW_DESIGN_RESOURCE_ID,
    jsonFields: ['designJson'],
    editing: {fields: ['designJson'], allowed: (viewId, view) => {guard(); return editorTargetAllows(viewId, view)}},
    columns: [{name: 'rowid', primary: true}, {name: 'viewId'}, {name: 'designJson'}],
    loadRow: async viewId => {
      const payload = await client.read(viewId)
      return {rowid: viewId, viewId, designJson: JSON.stringify(payload.data, null, 2)}
    },
    persistRow: async row => {
      const viewId = String(row['viewId'] ?? row['rowid'] ?? '')
      const data = parseJsonValue(String(row['designJson'] ?? ''), [])
      await client.write({viewId, data})
    },
  }, guard)
}
