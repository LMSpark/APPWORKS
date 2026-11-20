/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/structured-config/dictionary/application-resource
 * 职责：把当前应用级字典接入只读DataView，标准选项组件消费同一结果与scope证明。
 * 边界：只有读取，不授予业务编辑权限；不缓存标签或接受伪造的场景模型绑定。
 */
import type {BindReadonlyCommandQueryOptions, DataView} from '@spark-appworks/spark-data'
import {captureApplicationDictionaryQuery, captureAuthenticatedDictionaryQuery, type ApplicationDictionaryResourceOptions} from './application-query'
export type {ApplicationDictionaryResourceOptions} from './application-query'

/** 应用字典只读资源；名称属于来源身份，每个查询捕获本次应用执行域。 */
class DictionaryResource {
  constructor(private readonly options: ApplicationDictionaryResourceOptions, private readonly scope: 'application' | 'authenticated') {}
  /** 绑定配置声明的原视图；派生查询不另开字典或复制可编辑候选。 */
  binding(view: DataView): BindReadonlyCommandQueryOptions {
    const name = this.options.name.trim(), resourceId = `${this.scope}-dictionary:${name}`, dataSet = view.dataSet
    const captures = new WeakMap<object, ReturnType<typeof captureApplicationDictionaryQuery>>()
    const guard = () => {
      this.options.assertCurrent?.()
      if (!dataSet || dataSet.destroyed || view.destroyed || view.dataSet !== dataSet || dataSet.getView(view.dataTable?.tableName ?? '', view.viewId) !== view || view.dataTable?.modelBinding || view.dataTable?.resourceType !== 'logical-view' || view.dataTable.resourceId !== resourceId) throw Error('应用字典原视图身份已失效')
    }
    return {resource: {resourceType: 'logical-view', resourceId}, guard, derivedQueries: 'bound-view-only',
      captureQueryInputs: (target, params) => {
        guard()
        if (target !== view) throw Error('应用字典只能读取原绑定视图')
        const capture = (this.scope === 'application' ? captureApplicationDictionaryQuery : captureAuthenticatedDictionaryQuery)({...this.options, name, assertCurrent: guard})
        captures.set(params, capture)
        return capture.assertCurrent
      }, loadRows: async (_target, params) => {
        const capture = captures.get(params)
        if (!capture) throw Error('应用字典缺少原查询捕获')
        const rows = await capture.readRows(), values = new Set<string>()
        for (const row of rows) {
          const value = row['val'], label = row['txt']
          if (!['string', 'number', 'boolean'].includes(typeof value) || !String(value).trim()
            || !['string', 'number', 'boolean'].includes(typeof label) || !String(label).trim()
            || values.has(String(value))) throw Error('应用字典代码/标签无效或代码重复')
          values.add(String(value))
        }
        return rows.map(row => ({...row, value: String(row['val']), label: String(row['txt'])}))
      }}
  }
}

/** 应用字典始终要求当前应用身份。 */
export class ApplicationDictionaryResource extends DictionaryResource {
  constructor(options: ApplicationDictionaryResourceOptions) {super(options, 'application')}
}

/** 企业目录的只读字典，使用宿主本次登录/应用范围；不授予候选记录编辑权限。 */
export class AuthenticatedDictionaryResource extends DictionaryResource {
  constructor(options: ApplicationDictionaryResourceOptions) {super(options, 'authenticated')}
}
