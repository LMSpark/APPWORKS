/**
 * @module @spark-appworks/spark-project-model:page/page-tool
 * 职责：把正式 ProjectToolFile DataView 投影为页面工具定义，并将工具编辑直接写入绑定视图。
 * 边界：不持有独立正文草稿、保存基线或撤销历史；未绑定视图时只读。
 * AI用途：编辑工具定义时定位到当前 pageId 的正式文件 DataView。
 */
import {getSparkNodeChildren, SparkNodeTree} from '@spark-appworks/spark-data'
import type {DataRow, DataView, SparkNode, SparkNodeTree as SparkNodeTreeModel} from '@spark-appworks/spark-data'
import {ProjectToolResource} from '../page-tool/project-tool-resource'
import {parseRuleText, serializeRuleTree} from './page-file'
import {PAGE_TOOL_FILE_NAMES, type PageToolFileName} from './page-file'

/** 创建独立页面工具的稳定 pageId；不包含蓝图节点身份或运行数据。 */
export type PageToolOptions=Readonly<{pageId:string}>
/** 三文件编译输出，供一次页面调用物化；场景视图配置由场景文件独立提供。 */
export type PageToolDefinition=Readonly<{pageId:string;rule:SparkNode[];script:string|undefined;css:string|undefined}>
export type PageToolFileBindingOptions=Readonly<{assertCurrent?:()=>void;onChanged?:()=>void}>
type FileBinding=Readonly<{view:DataView;signature:string;assertCurrent:()=>void;onChanged:()=>void}>
type PageTextProjection=Readonly<{readonly text:string;readonly isDirty:boolean;getText():string}>
type PageRuleProjection=Readonly<{readonly root:SparkNode;readonly children:SparkNode[];readonly isDirty:boolean;getTree():SparkNodeTreeModel}>

/** 页面工具只投影正文；编辑状态与提交状态均由正式 ProjectToolFile DataView 持有。 */
export class PageTool{
  readonly pageId:string
  readonly rule:PageRuleProjection
  readonly script:PageTextProjection
  readonly style:PageTextProjection
  readonly #projections=new Map<PageToolFileName,string>()
  readonly #unreadableProjections=new Set<PageToolFileName>()
  readonly #bindings=new Map<PageToolFileName,FileBinding>()
  #loaded=false
  #ruleProjection:{text:string;tree:SparkNodeTreeModel}|undefined

  constructor(options:PageToolOptions){
    const id=options.pageId.trim()
    if(!id)throw new Error('页面工具缺少 pageId')
    this.pageId=id
    this.#projections.set('rule.json','[]')
    this.#projections.set('script.js','')
    this.#projections.set('style.css','')
    this.rule={
      get root(){return thisTool.ruleRoot()},
      get children(){return getSparkNodeChildren(structuredClone(thisTool.ruleRoot().children))},
      get isDirty(){return thisTool.isFileDirty('rule.json')},
      getTree(){return thisTool.getNodeTree()},
    }
    const thisTool=this
    this.script=this.createTextProjection('script.js')
    this.style=this.createTextProjection('style.css')
  }

  get isLoaded():boolean{return this.#loaded}
  markLoaded():void{this.#loaded=true}
  markUnloaded():void{this.#loaded=false}

  /** 装载只读投影文本；绑定视图时所有读取仍以 DataView 当前行及编辑覆盖为准。 */
  hydrateFileText(name:PageToolFileName,text:string):void{
    if(name==='rule.json')parseRuleText(text)
    this.#projections.set(name,text)
    this.#unreadableProjections.delete(name)
    if(name==='rule.json')this.#ruleProjection=undefined
  }

  /** 将明确 page/file 的已查询 DataView 绑定为唯一编辑入口。 */
  bindFileDataView(name:PageToolFileName,view:DataView,options:PageToolFileBindingOptions={}):void{
    const signature=this.bindingSignature(view,name)
    const binding:FileBinding={view,signature,assertCurrent:options.assertCurrent??(()=>undefined),onChanged:options.onChanged??(()=>undefined)}
    const located=this.locate(binding,name)
    const current=this.#bindings.get(name)
    if(current!==undefined&&current.view!==view&&!current.view.destroyed){
      if(current.view.hasUnconfirmedSave||current.view.hasEditingChanges()||current.view.dirtyTracking.hasPendingChanges())
        throw new Error('PAGE_TOOL_FILE_BINDING_PENDING: 旧文件视图仍有未确认修改')
    }
    const baseline=view.dirtyTracking.getOriginal(located.id)??located.row
    if(view.fieldAccess(located.row,'text').read!=='visible'||typeof baseline['text']!=='string')
      throw new Error('PAGE_TOOL_FILE_FIELD_HIDDEN: 正式文件文本字段当前不可读')
    this.#bindings.set(name,binding)
    this.#projections.set(name,baseline['text'])
    this.#unreadableProjections.delete(name)
    if(name==='rule.json')this.#ruleProjection=undefined
  }

  /** 卸载已清洁的 DataView owner；保留最后正文作为只读投影。 */
  unbindCleanFileDataViews():void{
    for(const [name,binding]of this.#bindings){
      if(binding.view.destroyed)throw new Error('PAGE_TOOL_FILE_VIEW_DESTROYED: 已销毁视图不能证明文件编辑状态清洁')
      if(!binding.view.hasUnconfirmedSave&&!binding.view.hasEditingChanges()&&!binding.view.dirtyTracking.hasPendingChanges()){
        const row=this.locate(binding,name)
        const baseline=binding.view.dirtyTracking.getOriginal(row.id)??row.row
        try{binding.assertCurrent()}catch{
          this.#projections.delete(name)
          this.#unreadableProjections.add(name)
          this.#bindings.delete(name)
          continue
        }
        if(binding.view.fieldAccess(row.row,'text').read!=='visible'||typeof baseline['text']!=='string'){
          this.#projections.delete(name)
          this.#unreadableProjections.add(name)
          this.#bindings.delete(name)
          continue
        }
        this.#projections.set(name,baseline['text'])
        this.#unreadableProjections.delete(name)
        this.#bindings.delete(name)
      }
    }
    this.#ruleProjection=undefined
  }

  getFileText(name:PageToolFileName):string{
    const binding=this.#bindings.get(name)
    if(binding!==undefined){
      if(binding.view.destroyed)throw new Error('PAGE_TOOL_FILE_VIEW_DESTROYED: 文件 DataView 已释放，不能读取旧编辑态')
      const located=this.tryLocate(binding,name)
      if(located){
        if(binding.view.fieldAccess(located.row,'text').read!=='visible')throw new Error('PAGE_TOOL_FILE_FIELD_HIDDEN: 正式文件文本字段当前不可读')
        const text=(binding.view.getEditingRow(located.id)??located.row)['text']
        if(typeof text!=='string')throw new Error('PAGE_TOOL_FILE_VIEW_TEXT: 正式文件行缺少有效文本字段')
        return text
      }
      throw new Error('PAGE_TOOL_FILE_VIEW_IDENTITY: 绑定文件目标已不再位于其查询结果中')
    }
    if(this.#unreadableProjections.has(name))throw new Error('PAGE_TOOL_FILE_FIELD_HIDDEN: 正式文件文本字段当前不可读')
    return this.#projections.get(name)??''
  }

  /** 每次编辑同步写入 DataView editing overlay；未绑定的 PageTool 只读。 */
  setFileText(name:PageToolFileName,text:string):void{
    if(name==='rule.json')parseRuleText(text)
    const binding=this.#requireBinding(name),located=this.locate(binding,name)
    binding.assertCurrent()
    if(typeof located.row['text']!=='string')throw new Error('PAGE_TOOL_FILE_VIEW_TEXT: 正式文件行缺少文本字段')
    const access=binding.view.fieldAccess(located.row,'text')
    if(access.read!=='visible'||access.write!=='allowed'||binding.view.editActionState(located.row)!=='enabled')
      throw new Error('PAGE_TOOL_FILE_FIELD_DENIED: 正式文件文本字段或编辑动作当前不可用')
    binding.view.updateEditingValue(located.id,'text',text)
    if(name==='rule.json')this.#ruleProjection=undefined
    binding.onChanged()
  }

  getDirtyFileNames():PageToolFileName[]{return PAGE_TOOL_FILE_NAMES.filter(name=>this.isFileDirty(name))}
  isFileDirty(name:PageToolFileName):boolean{
    const binding=this.#bindings.get(name)
    if(binding===undefined)return false
    if(binding.view.destroyed)throw new Error('PAGE_TOOL_FILE_VIEW_DESTROYED: 文件 DataView 已释放，不能读取旧编辑态')
    const located=this.locate(binding,name)
    return binding.view.hasUnconfirmedSave||binding.view.hasEditingChanges(located.id)
      ||binding.view.dirtyTracking.hasPendingChanges(located.id)
  }
  isDirty():boolean{return this.getDirtyFileNames().length>0}

  get nodeTree():SparkNodeTreeModel{return this.getNodeTree()}
  /** 返回从 DataView 当前文本解析的独立快照；修改快照不会改写视图。 */
  getNodeTree():SparkNodeTreeModel{
    const text=this.getFileText('rule.json')
    if(this.#ruleProjection?.text!==text)this.#ruleProjection={text,tree:SparkNodeTree.fromJson(parseRuleText(text))}
    return SparkNodeTree.fromJson(structuredClone(this.#ruleProjection.tree.root))
  }

  /** 在临时树上完成一次结构编辑，确认来源视图与文本未变后再写入同一 DataView。 */
  async editNodeTree(run:(tree:SparkNodeTreeModel)=>void|Promise<void>):Promise<void>{
    const binding=this.#requireBinding('rule.json')
    const before=this.getFileText('rule.json')
    const tree=this.getNodeTree()
    const originalTreeShape=JSON.stringify(tree.root)
    await run(tree)
    binding.assertCurrent()
    if(this.#bindings.get('rule.json')!==binding||this.getFileText('rule.json')!==before)
      throw new Error('PAGE_TOOL_FILE_TREE_STALE: 规则文件在树编辑期间已变化')
    if(JSON.stringify(tree.root)===originalTreeShape)return
    const editedTreeText=serializeRuleTree(tree.root)
    this.setFileText('rule.json',editedTreeText)
  }

  /** 未装载时拒绝输出定义；返回 DataView 投影，不附带独立文件状态。 */
  toDefinition():PageToolDefinition{
    if(!this.#loaded)throw new Error(`页面工具 ${this.pageId} 尚未加载`)
    const rule=this.rule.children,script=this.getFileText('script.js'),style=this.getFileText('style.css')
    return {pageId:this.pageId,rule,script:script.trim()?script:undefined,css:style.trim()?style:undefined}
  }

  private ruleRoot():SparkNode{
    const text=this.getFileText('rule.json')
    if(this.#ruleProjection?.text!==text)this.#ruleProjection={text,tree:SparkNodeTree.fromJson(parseRuleText(text))}
    return structuredClone(this.#ruleProjection.tree.root)
  }
  private createTextProjection(name:'script.js'|'style.css'):PageTextProjection{
    const tool=this
    return {get text(){return tool.getFileText(name)},get isDirty(){return tool.isFileDirty(name)},getText(){return tool.getFileText(name)}}
  }
  #requireBinding(name:PageToolFileName):FileBinding{
    const binding=this.#bindings.get(name)
    if(binding===undefined||binding.view.destroyed)throw new Error('PAGE_TOOL_FILE_VIEW_REQUIRED: 文件编辑必须绑定正式 DataView')
    return binding
  }
  private bindingSignature(view:DataView,name:PageToolFileName):string{
    const context=view.queryContext
    if(view.destroyed||view.tableName!=='ProjectToolFile'||view.dataTable?.resourceType!=='file'
      ||view.dataTable.resourceId!==ProjectToolResource.resources.ProjectToolFile||view.dataTable.modelBinding
      ||view.dataSet?.destroyed||!view.dataSet?.scenarioId)throw new Error('PAGE_TOOL_FILE_VIEW_IDENTITY: 只能绑定存活的正式 ProjectToolFile DataView')
    if(context['pageId']!==this.pageId||context['fileName']!==name||context['versionId']!==''
      ||typeof context['appId']!=='string'||!context['appId'].trim())throw new Error('PAGE_TOOL_FILE_VIEW_IDENTITY: 文件视图必须绑定明确工作文件 app/page/file')
    return JSON.stringify([view.dataSet.scenarioId,view.tableName,view.viewId,context['appId'],context['pageId'],context['fileName'],context['versionId']])
  }
  private locate(binding:FileBinding,name:PageToolFileName):{row:DataRow;id:string|number}{
    if(binding.view.destroyed||this.bindingSignature(binding.view,name)!==binding.signature)throw new Error('PAGE_TOOL_FILE_VIEW_IDENTITY: 文件视图目标或生命周期已变化')
    const matches=binding.view.rows.filter(row=>row['pageId']===this.pageId&&row['fileName']===name)
    if(matches.length!==1)throw new Error(`PAGE_TOOL_FILE_VIEW_IDENTITY: ${this.pageId}/${name} 未唯一绑定到正式文件行`)
    const row=matches[0]
    if(!row)throw new Error('PAGE_TOOL_FILE_VIEW_IDENTITY: 文件DataView行不存在')
    const id=binding.view.getPkKey(row)
    if(row['versionId']!=='')throw new Error('PAGE_TOOL_FILE_VIEW_IDENTITY: PageTool 只能绑定工作文件版本')
    if(typeof row['text']!=='string')throw new Error('PAGE_TOOL_FILE_VIEW_TEXT: 正式文件行缺少有效文本字段')
    if(id===undefined)throw new Error('PAGE_TOOL_FILE_VIEW_IDENTITY: 文件DataView行缺少稳定身份')
    return {row,id}
  }
  private tryLocate(binding:FileBinding,name:PageToolFileName):{row:DataRow;id:string|number}|undefined{
    try{return this.locate(binding,name)}catch{return undefined}
  }
}
