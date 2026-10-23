/**
 * @module app:lowcode/data-space/model-source/array/lowcode-data-space-array-draft
 * 职责：数组的局部定义输入、表头确认与JSON成员迁移。
 * 边界：未确认输入绑定元空间内临时DataView；正式新增或变更分别交回所属定义owner。
 * AI用途：新建数组及已有数组表头输入；已有正式字段引用由ArrayEdit提交前核验。
 */
import {buildDataViewKey, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'

/** 表头稳定身份：已有定义保留正式字段ID，新定义使用局部身份。 */
type Header = {
  /** 局部表头身份，用于同时改名/排序时追踪JSON成员。 */
  id:string
  /** 字段名称。 */
  name:string
  /** 字段标题。 */
  label:string
  /** 表头顺序。 */
  order:number
  /** 是否选作运行主键。 */
  primary:boolean
}
/** 已确认的数组输入；不携带后端权限或自行指定新增记录ID。 */
export type ArrayDefinition = {
  /** 新模型注册名。 */
  name:string
  /** 新模型描述。 */
  description:string
  /** 对象数组JSON原文。 */
  items:string
  /** 已确认字段定义。 */
  headers:readonly Header[]
}

/** 本次窗口的唯一局部输入视图；行编辑与取消复用DataView及标准JSON字段。 */
export class LowcodeDataSpaceArrayDraft {
  /** 标准表单、数组数据及表头组件绑定的输入视图。 */
  readonly view:DataView
  /** 同一元空间内的完整绑定身份。 */
  readonly key:string
  #disposed=false

  /** 只建立未确认输入，不新增正式模型或字段。 */
  constructor(private readonly dataSet:DataSet, initial?:ArrayDefinition) {
    const table=dataSet.addTable(`ArrayCreate_${crypto.randomUUID().replaceAll('-','')}`,
      ['id','name','description','items','headers','headerDraft'].map(name=>({name,type:'string',isPrimaryKey:name==='id'})))
    table.resourceType='static-data'
    this.view=table.getOrCreateView('default');this.view.commitMode='staged'
    this.view.replaceRows([{id:'array',name:initial?.name??'',description:initial?.description??'',items:initial?.items??'[]',
      headers:JSON.stringify(initial?.headers??[{id:'key',name:'rowid',label:'主键',order:0,primary:true}]),headerDraft:''}])
    this.view.setCurrentRowById('array')
    this.key=buildDataViewKey(table.tableName,'default',dataSet.scenarioId)
  }

  private text(field:string):string {
    if(this.#disposed || this.dataSet.destroyed)throw new Error('数组创建输入已释放')
    const value=this.view.getEditingRow('array')?.[field]
    if(typeof value!=='string')throw new Error(`数组输入必须是文本：${field}`)
    return value
  }
  private write(field:string,value:string):void {this.view.updateEditingValue('array',field,value)}

  private static rows(text:string):Array<Record<string,unknown>> {
    const value=parseJsonDocument(text)
    if(!Array.isArray(value) || value.some(row=>row===null || typeof row!=='object' || Array.isArray(row)))throw new Error('数组数据必须是对象数组')
    const rows: Array<Record<string, unknown>> = []
    for (const row of value) {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
      rows.push(row)
    }
    return rows
  }
  private static normalize(value:ReadonlyArray<Record<string,unknown>>):Header[] {
    if(!value.length)throw new Error('请至少设置一个字段')
    const names=new Set<string>(),ids=new Set<string>()
    const result=value.map((row,index)=>{
      const name=row['name'],id=row['id']??crypto.randomUUID(),label=row['label']??'',order=row['order']??index,primary=row['primary']??false
      if(typeof name!=='string' || name.length===0 || name!==name.trim() || name==='_pk' || name.includes('@') || names.has(name))throw new Error('字段名不能为空、重复、带首尾空白或使用保留名称')
      if(typeof id!=='string' || !id || ids.has(id))throw new Error('表头草稿身份不唯一')
      if(typeof label!=='string' || typeof order!=='number' || !Number.isFinite(order) || typeof primary!=='boolean')throw new Error('表头描述、排序或主键类型无效')
      ids.add(id);names.add(name);return {id,name,label,order,primary}
    })
    if(result.filter(row=>row.primary).length>1)throw new Error('当前运行模型只支持一个主键字段')
    return result.sort((a,b)=>a.order-b.order)
  }

  /** 已确认表头，供页面生成字段子组件。 */
  headers():Header[] {return LowcodeDataSpaceArrayDraft.normalize(LowcodeDataSpaceArrayDraft.rows(this.text('headers')))}
  /** 打开表头窗口；单独的编辑值只在确认时替换数组定义。 */
  beginHeaders():void {this.write('headerDraft',this.text('headers'))}
  /** 放弃未确认表头，原数组数据与表头不变。 */
  cancelHeaders():void {this.write('headerDraft','')}
  /** 同时处理全部表头改名/删列，防止交换名称时覆盖原值；未知成员保持。 */
  applyHeaders():void {
    const before=this.headers(),after=LowcodeDataSpaceArrayDraft.normalize(LowcodeDataSpaceArrayDraft.rows(this.text('headerDraft')))
    const previous=new Map(before.map(header=>[header.id,header])),oldNames=new Set(before.map(header=>header.name))
    const text=this.text('items'),rows=LowcodeDataSpaceArrayDraft.rows(text)
    const structural=before.length!==after.length || after.some(header=>previous.get(header.id)?.name!==header.name)
    const migrated=rows.map(row=>{
      const entries=Object.entries(row).filter(([name])=>!oldNames.has(name))
      const names=new Set(entries.map(([name])=>name))
      for(const header of after) {
        const old=previous.get(header.id)
        if(old && Object.hasOwn(row,old.name)) {
          if(names.has(header.name))throw new Error(`字段改名会覆盖未绑定数据：${header.name}`)
          entries.push([header.name,row[old.name]])
        }
      }
      return Object.fromEntries(entries)
    })
    this.write('headers',JSON.stringify(after))
    if(structural)this.write('items',JSON.stringify(migrated))
    this.cancelHeaders()
  }

  /** 校验当前已确认定义；未确认表头不参与正式提交。 */
  definition():ArrayDefinition {
    const result={name:this.text('name'),description:this.text('description'),items:this.text('items'),headers:this.headers()}
    LowcodeDataSpaceArrayDraft.prepare(result)
    return result
  }
  /** 纯定义转正式新增字段；入口再次校验，不能借结构化参数绕过UI校验。 */
  static prepare(input:ArrayDefinition) {
    if(typeof input.name!=='string' || typeof input.description!=='string' || typeof input.items!=='string')throw new Error('数组名称、描述和数据格式无效')
    const headers=this.normalize(input.headers),rows=this.rows(input.items),primary=headers.find(h=>h.primary)?.name??''
    if(primary) {
      const keys=new Set<string>()
      for(const row of rows) {
        const value=row[primary]
        if(typeof value!=='string' && typeof value!=='number' || value==='' || keys.has(String(value)))throw new Error('数组主键必须是非空、唯一的文本或数字')
        keys.add(String(value))
      }
    }
    return {model:{Type:'数组',MetaName:input.name,description:input.description,items:input.items,PrimaryKeyFields:primary,DbId:'',DbName:'',JoinType:'',ForeignKeyFields:'',JoinFilter:'',PId:''},
      fields:headers.map(header=>({type:'dataModel',Name:header.name,description:header.label,FieldType:'varchar',IsPKey:header.primary?1:0,IsOutput:1,
        AsName:'',ValueFun:'',Expression:'',allowAIAdd:0,OrderType:'',Order:header.order,Group:0}))}
  }
  /** 仅释放本次局部输入；不影响正式视图或未决新增记录。 */
  dispose():void {if(!this.#disposed){this.#disposed=true;if(!this.dataSet.destroyed)this.dataSet.removeTable(this.view.tableName)}}
}
