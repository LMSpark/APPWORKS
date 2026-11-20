/**
 * @module app:layout/host-local-runtime
 * 职责：为宿主界面状态（主题开关、项目上下文选择、系统设置与本机缓存列表）装配本地 static-data DataSet 与 PageRuntime，供标准组件按 dataViewKey 绑定。
 * 边界：不持久化、不访问后端、不授予任何业务数据权限；字段编辑经 onFieldEdit 回传宿主状态，宿主状态变化经 write 写回当前行。
 */
import {SparkData, buildDataViewKey, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'

/** 本地列；首列为主键。 */
export type HostLocalColumn = Readonly<{name: string; type: 'string' | 'boolean'}>
/** 本地表：列定义与初始行。 */
export type HostLocalTable = Readonly<{columns: readonly HostLocalColumn[]; rows: DataRow[]}>
/** scenarioId 只标识本次宿主本地空间，不对应正式数据空间。 */
export type HostLocalRuntimeInput = Readonly<{scenarioId: string; tables: Readonly<Record<string, HostLocalTable>>}>
/** 字段编辑回调：field 为字段名，value 为编辑后的值。 */
export type HostLocalFieldEdit = (field: string, value: unknown) => void

const VIEW_ID = 'default'
const LOCAL_PAGE_SIZE = 1000

export class HostLocalRuntime {
  private writing = false

  private constructor(
    readonly runtime: PageRuntime,
    private readonly dataSet: DataSet,
    private readonly scenarioId: string,
  ) {}

  static async create(input: HostLocalRuntimeInput): Promise<HostLocalRuntime> {
    const tables = Object.fromEntries(Object.entries(input.tables).map(([tableName, table]) => [tableName, {
      tableName, resourceType: 'static-data',
      columns: table.columns.map((column, index) => index === 0 ? {...column, isPrimaryKey: true} : {...column}),
      views: {[VIEW_ID]: {pageSize: LOCAL_PAGE_SIZE, rows: table.rows}},
    }]))
    const dataSet = SparkData.createDataSet({dataSetName: '宿主界面状态', scenarioId: input.scenarioId, tables})
    const runtime = new PageRuntime({pageId: `host-local:${input.scenarioId}`, scenarioIds: [input.scenarioId], loadScenario: () => Promise.resolve(dataSet)})
    await runtime.load()
    const local = new HostLocalRuntime(runtime, dataSet, input.scenarioId)
    for (const tableName of Object.keys(input.tables)) {
      const view = local.view(tableName)
      view.commitMode = 'staged'
      const first = view.rows[0]
      const id = first ? view.getPkKey(first) : undefined
      if (id !== undefined) view.setCurrentRowById(id)
    }
    return local
  }

  /** 本地表默认视图的完整绑定键。 */
  key(tableName: string): string {
    return buildDataViewKey(tableName, VIEW_ID, this.scenarioId)
  }

  view(tableName: string): DataView {
    const view = this.dataSet.getView(tableName, VIEW_ID)
    if (!view) throw new Error(`HOST_LOCAL_VIEW_MISSING: ${tableName}`)
    return view
  }

  /** 宿主值写回当前编辑行；写回期间不触发 onFieldEdit，避免把宿主自身的变化再回传给宿主。 */
  write(tableName: string, id: string, values: Readonly<Record<string, unknown>>): void {
    const view = this.view(tableName)
    this.writing = true
    try {
      for (const [field, value] of Object.entries(values)) {
        if (view.getEditingRow(id)?.[field] !== value) view.updateEditingValue(id, field, value)
      }
    } finally {
      this.writing = false
    }
  }

  /** 整批替换选项行（选项视图无编辑）。 */
  replaceRows(tableName: string, rows: DataRow[]): void {
    this.view(tableName).replaceRows(rows)
  }

  /** 订阅本地表的用户字段编辑；值未变化或来自 write 的事件不回传。 */
  onFieldEdit(tableName: string, handler: HostLocalFieldEdit): () => void {
    return this.dataSet.onAnyViewChange({editingFieldChanged: (table, viewId, event) => {
      if (this.writing || table !== tableName || viewId !== VIEW_ID || event.nextValue === event.previousValue) return
      handler(event.field, event.nextValue)
    }})
  }

  dispose(): void {
    this.runtime.dispose()
    if (!this.dataSet.destroyed) this.dataSet.destroy()
  }
}
