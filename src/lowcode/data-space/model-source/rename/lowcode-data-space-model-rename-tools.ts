/**
 * @module app:lowcode/data-space/model-source/rename/lowcode-data-space-model-rename-tools
 * 职责：经正式工具资源视图核查静态绑定，由DataSet保存改名差异。
 * 边界：不改导航、不改脚本，不将未挂载工具或原生Vue视为已扫描。
 * AI用途：模型注册名变更的工具引用预览及分步恢复。
 */
import {buildDataViewKey, parseDataViewKey, SparkNodeTree, type DataSet, type DataView, type DataRow} from '@spark-appworks/spark-data'
import {ProjectToolResource} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import type {ModelNameChange} from './lowcode-data-space-model-rename-references'

/** 本次改名的工具工作文件计划；只保存正式声明的静态完整绑定。 */
export class LowcodeDataSpaceModelRenameTools {
  /** 已确认的静态属性变更，供原预览DataView显示。 */
  readonly changes: ModelNameChange[] = []
  /** 本次完整读取的蓝图工具身份，不代表整个服务端工具库。 */
  readonly pageIds: string[] = []
  readonly #files = new Map<string, {rule: string; script: string; next: string}>()
  #catalog: Array<{pageId: string; versions: string[]}> = []
  readonly #writes = new Map<string, {view: DataView; next: string; signature: string}>()

  /** 固定空间、新旧注册名及同时变化的输出名；字段映射不用于字符串全局替换。 */
  private constructor(private readonly dataSet: DataSet, private readonly targetId: string,
    private readonly before: string, private readonly after: string, private readonly assertLive: () => void,
    private readonly fieldNames: ReadonlyMap<string,string>) {}

  /** 从正式远端蓝图读取去重工具及规则/脚本；任何读取失败或未解析旧名脚本均拒绝预览。 */
  static async prepare(dataSet: DataSet, targetId: string, before: string, after: string, assertLive: () => void,
    fieldNames: ReadonlyMap<string,string> = new Map()): Promise<LowcodeDataSpaceModelRenameTools> {
    const plan = new LowcodeDataSpaceModelRenameTools(dataSet, targetId, before, after, assertLive, fieldNames)
    plan.#catalog = await plan.inventory()
    plan.pageIds.push(...plan.#catalog.map(item => item.pageId))
    await plan.checkPublished()
    for (const pageId of plan.pageIds) {
      const rule = await plan.readFile(pageId, 'rule.json')
      const script = await plan.readFile(pageId, 'script.js')
      plan.assertScript(pageId, script)
      const parsed = plan.patch(pageId, rule)
      plan.changes.push(...parsed.changes)
      plan.#files.set(pageId, {rule, script, next: parsed.text})
    }
    return plan
  }

  private async inventory(): Promise<Array<{pageId: string; versions: string[]}>> {
    const view = await this.query('ProjectToolCatalog', {})
    try {return view.rows.map(row => {
      const versions: unknown = row['versions']
      if (typeof row['pageId'] !== 'string' || !Array.isArray(versions) || versions.some(item => typeof item !== 'string')) throw new Error('工具清单返回身份无效')
      return {pageId: row['pageId'], versions: versions.map(item => String(item))}
    })} finally {view.dataTable?.destroyView(view.viewId)}
  }

  private async query(name: keyof typeof ProjectToolResource.resources, context: Record<string, unknown>): Promise<DataView> {
    this.assertLive()
    const source = this.dataSet.getView(name, 'default')
    if (!source || source.dataTable?.resourceType !== 'file' || source.dataTable.resourceId !== ProjectToolResource.resources[name]) throw new Error(`正式元空间缺少工具资源 ${name}，请升级配置`)
    const view = source.createQueryView(`modelRenameTool:${crypto.randomUUID()}`)
    try {
      view.configure({queryContext: context, commitMode: 'staged', filterExpression: {logic: 'and', filters: []}, fieldProjection: [], queryConfig: {allPages: true, maxRows: 50000}})
      const loaded = await view.loadFromServer({singleFlight: false}); this.assertLive()
      if (!loaded.success || view.total !== view.rows.length) throw new Error(loaded.message ?? '工具资源未完整读取')
      for (const row of view.rows) for (const field of Object.keys(row).filter(key => key !== '_pk')) {
        if (view.fieldAccess(row, field).read !== 'visible') throw new Error('工具依赖字段不可读')
      }
      return view
    } catch (cause) {view.dataTable?.destroyView(view.viewId); throw cause}
  }

  private async readFile(pageId: string, fileName: string, versionId = ''): Promise<string> {
    const view = await this.query('ProjectToolFile', {pageId, fileName, versionId})
    try {return this.fileRow(view, pageId, fileName, versionId)['text'] as string}
    finally {view.dataTable?.destroyView(view.viewId)}
  }

  private fileRow(view: DataView, pageId: string, fileName: string, versionId = ''): DataRow {
    const row = view.rows[0]
    if (view.rows.length !== 1 || row?.['pageId'] !== pageId || row['fileName'] !== fileName || row['versionId'] !== versionId || typeof row['text'] !== 'string') throw new Error('工具文件查询身份不一致')
    if (!versionId && row['localDirty'] === true) throw new Error(`工具 ${pageId} 有本地编辑，请先处理`)
    return row
  }

  private signature(view: DataView): string {
    return JSON.stringify([view.queryContext, view.filterExpression, view.rows.map(row => {
      const key = view.getPkKey(row)
      if (key === undefined) throw new Error('工具文件缺少查询主键')
      return view.getEditingRow(key) ?? row
    })])
  }

  private async writeFile(pageId: string, expected: string, next: string): Promise<void> {
    let pending = this.#writes.get(pageId)
    if (pending && (pending.view.destroyed || this.signature(pending.view) !== pending.signature)) throw new Error('工具命令视图已被其他编辑改变，不能覆盖')
    if (pending && pending.next !== next) {
      // 显式协调已经核对远端和全部引用，才允许用新基线重建本命令的编辑。
      pending.view.discardPendingChanges(); pending.view.dataTable?.destroyView(pending.view.viewId)
      this.#writes.delete(pageId); pending = undefined
    }
    if (!pending) {
      const view = await this.query('ProjectToolFile', {pageId, fileName: 'rule.json', versionId: ''})
      try {
        const row = this.fileRow(view, pageId, 'rule.json'), text = row['text']
        if (text !== expected && text !== next) throw new Error(`工具 ${pageId} 远端原文已变化`)
        if (text === next) {view.dataTable?.destroyView(view.viewId); return}
        const key = view.getPkKey(row)
        if (key === undefined) throw new Error('工具文件缺少查询主键')
        view.updateEditingValue(key, 'text', next)
        pending = {view, next, signature: this.signature(view)}; this.#writes.set(pageId, pending)
      } catch (cause) {view.dataTable?.destroyView(view.viewId); throw cause}
    }
    const {view} = pending
    const result = await this.dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
    this.assertLive()
    if (!result.success) throw new Error(result.message ?? '工具文件保存未确认')
    if (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) throw new Error('工具文件仍有未确认修改')
    this.#writes.delete(pageId); view.dataTable?.destroyView(view.viewId)
  }

  private async checkPublished(): Promise<void> {
    for (const {pageId, versions} of this.#catalog) for (const version of versions) {
      const rule = await this.readFile(pageId, 'rule.json', version)
      const script = await this.readFile(pageId, 'script.js', version)
      if (this.patch(pageId, rule).changes.length || this.scriptReferences(script)) {
        throw new Error(`工具 ${pageId} 的发布快照 ${version} 仍引用旧注册名，须先处理发布依赖；未修改快照或发布指针`)
      }
    }
  }

  private assertScript(pageId: string, script: string): void {
    if (this.scriptReferences(script)) throw new Error(`工具 ${pageId}/script.js 含旧注册名或字段，须先核对脚本引用；不会自动替换`)
  }

  private scriptReferences(script:string):boolean {
    return this.before!==this.after&&script.includes(this.before)||[...this.fieldNames.keys()].some(name=>script.includes(name))
  }

  private patch(pageId: string, text: string): {text: string; changes: ModelNameChange[]} {
    if (!text.trim()) return {text, changes: []}
    SparkNodeTree.fromRuleJson(text)
    const root: unknown = JSON.parse(text), changes: ModelNameChange[] = []
    // null表示JSON文档内部字段上下文；不能继承外层正式模型的字段身份。
    const props = (value: Record<string, unknown>, path: string, inherited?: string|null, documentChildren=false): void => {
      const own=value['dataViewKey'],context=typeof own==='string'?own:inherited,currentBinding=context?parseDataViewKey(context):undefined
      if(context!==null&&this.fieldNames.size&&typeof value['field']==='string'&&this.fieldNames.has(value['field'])&&!currentBinding?.scope)throw new Error(`工具 ${pageId} 的 ${path}.field 缺少可确认的完整视图绑定，须先核查`)
      if(this.fieldNames.size&&currentBinding?.scope===this.targetId&&currentBinding.tableName===this.before){
        for(const key of ['field','valueField','labelField']){
          const original=value[key]
          const next=Array.isArray(original)?original.map((name:unknown)=>typeof name==='string'?this.fieldNames.get(name)??name:name)
            :typeof original==='string'?this.fieldNames.get(original)??original:original
          if(JSON.stringify(next)!==JSON.stringify(original)){
            changes.push({table:'rule.json',id:pageId,property:`${path}.${key}`,before:JSON.stringify(original),after:JSON.stringify(next)});value[key]=next
          }
        }
        for(const [key,item]of Object.entries(value))if(!['field','valueField','labelField'].includes(key)&&key.endsWith('Field')&&typeof item==='string'&&this.fieldNames.has(item))throw new Error(`工具 ${pageId} 的 ${path}.${key} 须先确认字段绑定归属`)
      }
      for (const key of ['dataViewKey', 'optionDataViewKey', 'edgeDataViewKey', 'additionalEdgeDataViewKey']) {
        const original = value[key]
        if (typeof original !== 'string') continue
        const binding = parseDataViewKey(original)
        if (this.before !== this.after && binding?.scope === this.targetId && binding.tableName === this.before) {
          const after = buildDataViewKey(this.after, binding.viewId, this.targetId)
          changes.push({table: 'rule.json', id: pageId, property: `${path}.${key}`, before: original, after}); value[key] = after
        }
      }
      if (Array.isArray(value['additionalNodeSources'])) value['additionalNodeSources'].forEach((source, index) => {
        if (isRecord(source)) props(source, `${path}.additionalNodeSources[${index}]`)
      })
      for (const key of ['toolbar', 'actions', 'filter', 'tail']) if (isRecord(value[key])) props(value[key], `${path}.${key}`,context)
      if(isRecord(value['header'])){
        if(isRecord(value['header']['props']))nodes([value['header']],`${path}.header`,context)
        else props(value['header'],`${path}.header`,context)
      }
      if (isRecord(value['then']) && typeof value['then']['action'] === 'string') props(value['then'], `${path}.then`,context)
      if (Array.isArray(value['children'])) nodes(value['children'], `${path}.children`,documentChildren?null:context)
    }
    const nodes = (values: unknown[], path: string, inherited?: string|null): void => values.forEach((value, index) => {
      if (!isRecord(value) || typeof value['type'] !== 'string') return
      const address = `${path}[${index}]`
      const own=isRecord(value['props'])?value['props']['dataViewKey']:undefined,context=typeof own==='string'?own:inherited
      if (isRecord(value['props'])) {
        props(value['props'], `${address}.props`,inherited,value['type']==='r-json')
        // Mention的options是数据绑定配置；其他字段的options可能是普通业务数组。
        if (value['type'] === 'r-mention' && isRecord(value['props']['options'])) props(value['props']['options'], `${address}.props.options`)
      }
      if (Array.isArray(value['children'])) nodes(value['children'], `${address}.children`,value['type']==='r-json'?null:context)
    })
    nodes(Array.isArray(root) ? root : [root], '$')
    return {text: changes.length ? `${JSON.stringify(root, null, 2)}\n` : text, changes}
  }

  /** 数据库派发前核对完整清单及读取基线，不覆盖本地工具草稿。 */
  async assertCurrent(): Promise<void> {
    if (JSON.stringify(await this.inventory()) !== JSON.stringify(this.#catalog)) throw new Error('蓝图工具清单或发布指针已变化，请重新预览改名')
    await this.checkPublished()
    for (const [id, file] of this.#files) {
      const rule = await this.readFile(id, 'rule.json')
      const script = await this.readFile(id, 'script.js')
      if (rule !== file.rule || script !== file.script) throw new Error(`工具 ${id} 已变化，请重新预览改名`)
    }
  }

  /** 数据库确认后逐工具核验及保存；丢回执按目标原文确认，已完成文件不重写。 */
  async complete(reconcile: boolean): Promise<void> {
    if (JSON.stringify(await this.inventory()) !== JSON.stringify(this.#catalog)) throw new Error('蓝图工具清单或发布指针已变化，改名文件尚未全部确认')
    for (const [id, file] of this.#files) {
      const script = await this.readFile(id, 'script.js'); this.assertScript(id, script)
      let expected = file.rule, next = file.next
      if (reconcile && this.fieldNames.size) {
        const remote = await this.readFile(id, 'rule.json')
        if(remote!==file.rule&&remote!==file.next)throw new Error(`工具 ${id} 在字段改名期间已变化，须核查冲突；不会重复替换`)
        expected=remote
      } else if (reconcile) {
        const remote = await this.readFile(id, 'rule.json')
        const parsed = this.patch(id, remote)
        const known = this.changes.filter(change => change.id === id)
        if (parsed.changes.some(change => !known.some(original => original.property === change.property && original.before === change.before))) {
          throw new Error(`工具 ${id} 新增旧名引用，须先核对；未自动补写`)
        }
        expected = remote; next = parsed.text
      }
      if (file.rule !== file.next || expected !== next) await this.writeFile(id, expected, next)
      else {
        const remote = await this.readFile(id, 'rule.json')
        if (this.fieldNames.size ? remote!==file.next : this.patch(id, remote).changes.length>0) throw new Error(`工具 ${id} 出现未预览的旧名引用`)
      }
    }
    if (JSON.stringify(await this.inventory()) !== JSON.stringify(this.#catalog)) throw new Error('蓝图工具清单或发布指针已变化，改名文件尚未全部确认')
    await this.checkPublished()
    for (const id of this.pageIds) {
      const rule = await this.readFile(id, 'rule.json')
      const script = await this.readFile(id, 'script.js'); this.assertScript(id, script)
      if (this.fieldNames.size ? rule!==this.#files.get(id)?.next : this.patch(id, rule).changes.length>0) throw new Error(`工具 ${id} 回读仍有旧名引用，未自动补写`)
    }
  }
}
