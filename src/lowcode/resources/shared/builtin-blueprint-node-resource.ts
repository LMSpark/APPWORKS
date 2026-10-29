import {DataViewLocalQuery, type DataRow, type DataView, type QueryParams} from '@spark-appworks/spark-data'
import {getBuiltinApplicationDescriptor} from '@/registries/builtin-application-registry'
import {BUILTIN_BLUEPRINT_BUSINESS_FIELDS, readBuiltinSystemNavigation} from './builtin-system-navigation'

export const BUILTIN_BLUEPRINT_NODE_TABLE_NAME = 'RepositoryBlueprintNode'
export const BUILTIN_BLUEPRINT_NODE_RESOURCE_ID = 'repository:navigation:appworks-system:records'

type Executor = Parameters<DataView['bindQueryExecutor']>[0]
type QueryResult = Awaited<ReturnType<Executor['executeQuery']>>

/** A read-only SPARK data executor over the complete repository-owned blueprint source. */
export class BuiltinBlueprintNodeResource {
  /** Bind only the declared file resource; it never supplies a backend model identity or saver. */
  constructor(private readonly options: Readonly<{applicationId: string; scenarioId: string; assertCurrent(): void}>) {
    const descriptor = getBuiltinApplicationDescriptor()
    if (options.applicationId !== descriptor.id || !options.scenarioId.trim()) {
      throw new Error('BUILTIN_BLUEPRINT_IDENTITY: 仓内蓝图节点资源身份无效')
    }
  }

  /** Install the executor on the explicitly declared file DataView. */
  bind(view: DataView): void {
    this.assertView(view)
    view.bindQueryExecutor(this.executor,
      {resource: {resourceType: 'file', resourceId: BUILTIN_BLUEPRINT_NODE_RESOURCE_ID}})
  }

  /** Executor form used when the scenario assembler binds every declared file view. */
  get executor(): Executor {
    return {executeQuery: async (view, params) => this.executeQuery(view, params)}
  }

  private assertView(view: DataView): void {
    this.options.assertCurrent()
    const table = view.dataTable
    if (view.destroyed || view.dataSet?.destroyed !== false || view.dataSet.scenarioId !== this.options.scenarioId
      || view.tableName !== BUILTIN_BLUEPRINT_NODE_TABLE_NAME || view.viewId !== 'default'
      || table?.resourceType !== 'file' || table.resourceId !== BUILTIN_BLUEPRINT_NODE_RESOURCE_ID || table.modelBinding) {
      throw new Error('BUILTIN_BLUEPRINT_IDENTITY: 仓内蓝图 DataView 绑定身份无效')
    }
  }

  async executeQuery(view: DataView, params: QueryParams): Promise<QueryResult> {
    this.assertView(view)
    const navigation = await readBuiltinSystemNavigation(this.options.assertCurrent)
    this.assertView(view)
    const rows = navigation.records.map(record => ({...record}))
    const selected = DataViewLocalQuery.select({rows, fields: new Set(BUILTIN_BLUEPRINT_BUSINESS_FIELDS), primaryKeys: ['rowid'], params})
    const keys = new Set(selected.rows.map(row => String(row['rowid'])))
    const result: QueryResult = {
      rows: selected.rows,
      total: selected.total,
      rowKey: (row: Readonly<DataRow>) => row['rowid'],
      assertIdentity: identity => {
        this.assertView(view)
        if (identity.scenarioId !== this.options.scenarioId || identity.metaName !== BUILTIN_BLUEPRINT_NODE_TABLE_NAME
          || identity.resource?.resourceType !== 'file' || identity.resource.resourceId !== BUILTIN_BLUEPRINT_NODE_RESOURCE_ID) {
          throw new Error('BUILTIN_BLUEPRINT_IDENTITY: 仓内蓝图查询身份不匹配')
        }
      },
      fieldAccess: (key, field) => {
        this.assertView(view)
        const visible = keys.has(String(key)) && selected.output.has(field)
        return {read: visible ? 'visible' : 'invisible', write: 'denied', component: visible ? 'readonly' : 'hidden',
          required: false, writeMode: 'readonly'}
      },
      readFieldAccess: (_row, field) => {
        this.assertView(view)
        return selected.output.has(field) ? 'visible' : 'invisible'
      },
      addActionState: () => 'disabled',
      editActionState: () => 'disabled',
      deleteActionState: () => 'disabled',
      createChildActionState: () => 'disabled',
      viewActionState: key => {
        this.assertView(view)
        return keys.has(String(key)) ? 'enabled' : 'hidden'
      },
    }
    return result
  }
}
