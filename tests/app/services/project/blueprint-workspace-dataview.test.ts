import {describe, expect, it} from 'vitest'
import {DataSet, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'

const PROJECT='APP-1'
const FIELDS=['rowid','SysId','prowid','FunOrderValue','name','FunName','funCode','conid','conType','NavigationUrl',
  'NavigationImageWxz','MobileUrl','NavigationType','ChildItemLocation','NavigationShowType','HorizontalAlignment',
  'IsShowAtNav','IsShowChildItem','BeginGroup','memo','htmlDesc','VersionId','DifficultyFactor','Manhour','Number','Sum','Total','personCharge','status']
type FixtureOptions=Readonly<{hiddenFields?:readonly string[];editableByRow?:Readonly<Record<string,readonly string[]>>;outputFields?:readonly string[];
  omitTotal?:boolean;totalDelta?:number;orphan?:boolean;unknownFirstSave?:boolean}>

function initialRows():DataRow[]{return [
  {rowid:'NAV-ROOT',SysId:PROJECT,prowid:'000000',FunOrderValue:0,name:'APP',FunName:'APP',funCode:'APP',conid:'',conType:'Model',NavigationUrl:''},
  {rowid:'NAV-GROUP',SysId:PROJECT,prowid:'NAV-ROOT',FunOrderValue:0,name:'Group',FunName:'Group',funCode:'GROUP',conid:'',conType:'Model',NavigationUrl:''},
  {rowid:'NAV-BOUND',SysId:PROJECT,prowid:'NAV-GROUP',FunOrderValue:0,name:'DataSetManage',FunName:'DataSpace',funCode:'DATA-SPACE-MANAGE',conid:'DATASET-1',conType:'Navitem',NavigationUrl:'vue:/features/data-platform/data-set-management/ui/data-set-list-page'},
  {rowid:'NAV-BOUND-2',SysId:PROJECT,prowid:'NAV-ROOT',FunOrderValue:1,name:'Service',FunName:'Service',funCode:'SERVICE',conid:'',conType:'Navitem',NavigationUrl:''},
  {rowid:'NAV-OTHER',SysId:PROJECT,prowid:'NAV-ROOT',FunOrderValue:2,name:'Other',FunName:'Other',funCode:'OTHER',conid:'',conType:'Navitem',NavigationUrl:''},
].map(row=>({...Object.fromEntries(FIELDS.map(field=>[field,field==='FunOrderValue'?0:''])),...row}))}

function createFixture(options:FixtureOptions={}){
  const rows=initialRows(),hidden=new Set(options.hiddenFields??[]),output=new Set(options.outputFields??FIELDS),editable=options.editableByRow??{}
  if(options.orphan)rows.push({rowid:'NAV-ORPHAN',SysId:PROJECT,prowid:'NAV-MISSING',FunOrderValue:9,name:'Orphan',FunName:'Orphan',funCode:'ORPHAN',conType:'Navitem',NavigationUrl:''})
  const dataSet=DataSet.fromJson({scenarioId:LOWCODE_APPLICATION_CATALOG_FORM_KEY,tables:{Base_NavigationInfo:{
    modelBinding:{modelId:`${LOWCODE_APPLICATION_CATALOG_FORM_KEY}p000`,modelName:'Base_NavigationInfo'},
    columns:FIELDS.map(name=>({name,type:name==='FunOrderValue'?'number':'string',isPrimaryKey:name==='rowid'})),
    views:{default:{autoLoad:false,fields:[...output],treeConfig:{idField:'rowid',parentIdField:'prowid',textField:'FunName',rootParentValue:'000000'}}},
  }}})
  const view=dataSet.getView('Base_NavigationInfo','default')!
  const saveRequests:Array<Readonly<{ids:readonly string[];patches:readonly DataRow[]}>>=[]
  const verificationIds:string[][]=[]
  let queryCount=0,saveAttempts=0,writeCount=0,unknownPending=false,unknownFirstSave=options.unknownFirstSave===true
  let nextQueryGate:Readonly<{started:()=>void;wait:Promise<void>}>&{release:()=>void}|undefined
  const result=(selected:readonly DataRow[])=>({
    rows:selected,total:options.omitTotal?0:selected.length+(options.totalDelta??0),countReported:!options.omitTotal,resultPrimaryKey:'rowid',
    rowKey:(row:Readonly<DataRow>)=>row['rowid'],
    assertIdentity:(identity:{scenarioId:string;metaName:string})=>{
      if(identity.scenarioId!==LOWCODE_APPLICATION_CATALOG_FORM_KEY||identity.metaName!=='Base_NavigationInfo')throw new Error('blueprint query identity mismatch')
    },
    fieldAccess:(key:unknown,field:string)=>{
      const row=selected.find(candidate=>candidate['rowid']===key)
      const readable=Boolean(row&&output.has(field)&&Object.hasOwn(row,field)&&!hidden.has(field))
      const canWrite=readable&&((editable[String(key)]??['prowid','FunOrderValue']).includes(field))
      return {read:readable?'visible' as const:'invisible' as const,write:canWrite?'allowed' as const:'denied' as const,
        component:readable?(canWrite?'editable' as const:'readonly' as const):'hidden' as const,required:false,
        writeMode:canWrite?'editable' as const:'readonly' as const}
    },
    readFieldAccess:(row:Readonly<DataRow>,field:string)=>output.has(field)&&Object.hasOwn(row,field)&&!hidden.has(field)?'visible' as const:'invisible' as const,
    addActionState:()=> 'disabled' as const,editActionState:()=> 'enabled' as const,deleteActionState:()=> 'disabled' as const,
    createChildActionState:()=> 'disabled' as const,viewActionState:()=> 'enabled' as const,
  })
  const executor:Parameters<DataView['bindQueryExecutor']>[0]={
    queryColumns:target=>target.columns,
    executeQuery:async(_target,params)=>{
      queryCount++
      if(nextQueryGate){const gate=nextQueryGate;nextQueryGate=undefined;gate.started();await gate.wait}
      const matches=(row:DataRow,filter:unknown):boolean=>{
        if(!filter||typeof filter!=='object')return true
        const condition=filter as Record<string,unknown>
        if(Array.isArray(condition['filters']))return condition['filters'].every(item=>matches(row,item))
        if(condition['logic']==='and'&&Array.isArray(condition['conditions']))return condition['conditions'].every(item=>matches(row,item))
        const field=condition['field'],value=condition['value']
        return typeof field!=='string'||String(row[field]??'')===String(value??'')
      }
      return result(rows.filter(row=>row['SysId']===PROJECT&&matches(row,params.filter)))
    },
    save:async command=>{
      saveAttempts++
      const changes=command.changes[0]?.changes.changed??[]
      const ids=changes.map(row=>String(row['rowid']??''))
      if(unknownPending){
        verificationIds.push(ids)
        const verified=changes.every(patch=>{
          const stored=rows.find(row=>row['rowid']===patch['rowid']&&row['SysId']===PROJECT)
          return stored&&Object.entries(patch).every(([field,value])=>Object.is(stored[field],value))
        })
        if(!verified)throw new Error('SPARK_SAVE_UNVERIFIABLE: 原移动补丁状态不完整')
        unknownPending=false
        return command.changes.map(change=>{const changed=change.changes.changed??[];return {metaName:change.identity.metaName,changed,added:[],deleted:[],
          changedFields:changed.map(row=>Object.keys(row)),context:result(rows.filter(row=>row['SysId']===PROJECT))}})
      }
      const patches=changes.map(patch=>({...patch}))
      saveRequests.push({ids,patches});writeCount++
      for(const patch of changes){const stored=rows.find(row=>row['rowid']===patch['rowid']&&row['SysId']===PROJECT);if(stored)Object.assign(stored,patch)}
      if(unknownFirstSave){unknownFirstSave=false;unknownPending=true;throw Object.assign(new Error('transport timeout after apply'),{name:'RequestError'})}
      return command.changes.map(change=>{const changed=change.changes.changed??[];return {metaName:change.identity.metaName,changed,added:[],deleted:[],
        changedFields:changed.map(row=>Object.keys(row)),context:result(rows.filter(row=>row['SysId']===PROJECT))}})
    },
    hasUnconfirmedSave:()=>unknownPending,
  }
  view.bindQueryExecutor(executor)
  const owner=new BlueprintWorkspaceDataView(dataSet,PROJECT,()=>undefined)
  return {dataSet,view,owner,rows,saveRequests,verificationIds,queryCount:()=>queryCount,saveAttempts:()=>saveAttempts,writeCount:()=>writeCount,
    holdNextQuery(){let started!:()=>void,release!:()=>void;const startedPromise=new Promise<void>(resolve=>{started=resolve}),wait=new Promise<void>(resolve=>{release=resolve});
      nextQueryGate={started,wait,release};return {started:startedPromise,release}},
  }
}

function findNode(node:{nodeId:string;children?:readonly any[]},id:string):any{return node.nodeId===id?node:node.children?.map(child=>findNode(child,id)).find(Boolean)}
function withPosition(node:any,parentNodeId:string,order:number):any{return {...node,parentNodeId,navigation:{...(node.navigation??{title:node.capability.name,order,publishInMenu:false,showChildren:false,beginGroup:false}),order}}}

describe('BlueprintWorkspaceDataView direct DataSet contract',()=>{
  it('keeps currentRow aligned with selected identity and clears its edit overlay on cancel',async()=>{
    const fixture=createFixture()
    await fixture.owner.load('NAV-BOUND')
    expect(fixture.view.currentRow).toBe(fixture.owner.row)
    expect(fixture.view.currentRow?.['rowid']).toBe('NAV-BOUND')
    fixture.owner.update('prowid','TEMP')
    expect(fixture.view.getEditingRow('NAV-BOUND')?.['prowid']).toBe('TEMP')
    fixture.owner.cancel()
    expect(fixture.view.getEditingRow('NAV-BOUND')?.['prowid']).not.toBe('TEMP')
    await fixture.owner.load('NAV-GROUP')
    expect(fixture.view.currentRow).toBe(fixture.owner.row)
    expect(fixture.view.currentRow?.['rowid']).toBe('NAV-GROUP')
    fixture.owner.update('prowid','TEMP')
    fixture.owner.cancel()
    expect(fixture.view.getEditingRow('NAV-GROUP')?.['prowid']).not.toBe('TEMP')
    expect(fixture.saveRequests).toHaveLength(0)
  })

  it('keeps selected-row read and write decisions from the DataView permission result',async()=>{
    const fixture=createFixture({editableByRow:{'NAV-BOUND':['prowid']},hiddenFields:['HorizontalAlignment']})
    await fixture.owner.load('NAV-BOUND')
    expect(fixture.owner.canRead('prowid')).toBe(true)
    expect(fixture.owner.canWrite('prowid')).toBe(true)
    expect(fixture.owner.canRead('HorizontalAlignment')).toBe(false)
    expect(fixture.owner.canWrite('HorizontalAlignment')).toBe(false)
    expect(()=>fixture.owner.update('HorizontalAlignment','Center')).toThrow('当前查询权限不允许写入')
    expect(fixture.owner.dirty).toBe(false)
    expect(fixture.saveRequests).toHaveLength(0)
  })

  it('preflights every affected sibling and rejects descendant cycles without partial edits',async()=>{
    const fixture=createFixture({editableByRow:{'NAV-BOUND':['prowid','FunOrderValue'],'NAV-GROUP':['FunOrderValue'],'NAV-BOUND-2':[],'NAV-OTHER':['FunOrderValue']}})
    await expect(fixture.owner.moveNode('NAV-BOUND','NAV-ROOT',0)).rejects.toThrow('权限拒绝移动行 NAV-BOUND-2')
    expect(fixture.view.editingRows).toEqual([])
    expect(fixture.owner.dirty).toBe(false)
    expect(fixture.saveRequests).toHaveLength(0)
    await expect(fixture.owner.moveNode('NAV-GROUP','NAV-BOUND',0)).rejects.toThrow('自身后代')
    expect(fixture.view.editingRows).toEqual([])
    expect(fixture.saveRequests).toHaveLength(0)
  })

  it.each(['prowid','FunOrderValue'])('rejects a tree move when the DataView hides %s',async field=>{
    const fixture=createFixture({hiddenFields:[field]})
    await expect(fixture.owner.moveNode('NAV-BOUND','NAV-ROOT',0)).rejects.toThrow('不可读取完整树结构')
    expect(fixture.owner.dirty).toBe(false)
    expect(fixture.saveRequests).toHaveLength(0)
  })

  it('stages a permitted move, cancels without saving, then saves exact affected ids and reads them back',async()=>{
    const fixture=createFixture()
    await fixture.owner.moveNode('NAV-BOUND','NAV-ROOT',0)
    expect(fixture.owner.dirty).toBe(true)
    expect(fixture.owner.treeProjection().children[0]?.nodeId).toBe('NAV-BOUND')
    expect(fixture.saveRequests).toHaveLength(0)
    fixture.owner.cancel()
    expect(fixture.owner.dirty).toBe(false)
    expect(findNode(fixture.owner.treeProjection(),'NAV-BOUND')?.parentNodeId).toBe('NAV-GROUP')
    await fixture.owner.moveNode('NAV-BOUND','NAV-ROOT',0)
    await fixture.owner.save()
    expect(fixture.saveRequests).toHaveLength(1)
    expect([...fixture.saveRequests[0]?.ids??[]].sort()).toEqual(['NAV-BOUND','NAV-BOUND-2','NAV-GROUP','NAV-OTHER'])
    expect(fixture.rows.find(row=>row['rowid']==='NAV-ROOT')?.['prowid']).toBe('000000')
    expect(fixture.rows.find(row=>row['rowid']==='NAV-BOUND')?.['prowid']).toBe('NAV-ROOT')
    expect(fixture.owner.dirty).toBe(false)
    expect(fixture.owner.treeProjection().children.map(node=>node.nodeId)).toContain('NAV-BOUND')
  })

  it('saves multiple leaf moves and sibling reorder as one exact DataSet command',async()=>{
    const fixture=createFixture()
    const before=await fixture.owner.loadProjectTree(),group=findNode(before,'NAV-GROUP'),bound=findNode(before,'NAV-BOUND'),bound2=findNode(before,'NAV-BOUND-2'),other=findNode(before,'NAV-OTHER')
    const expected={...before,children:[{...group,children:[withPosition(bound2,'NAV-GROUP',0)]},withPosition(other,'NAV-ROOT',1),withPosition(bound,'NAV-ROOT',2)]}
    const commands=[
      {kind:'move' as const,nodeId:'NAV-BOUND',previousParentNodeId:'NAV-GROUP',parentNodeId:'NAV-ROOT',depth:1,siblingIndex:2,fields:{prowid:'NAV-ROOT',FunOrderValue:2}},
      {kind:'move' as const,nodeId:'NAV-BOUND-2',previousParentNodeId:'NAV-ROOT',parentNodeId:'NAV-GROUP',depth:2,siblingIndex:0,fields:{prowid:'NAV-GROUP',FunOrderValue:0}},
      {kind:'reorder' as const,nodeId:'NAV-OTHER',previousParentNodeId:'NAV-ROOT',parentNodeId:'NAV-ROOT',depth:1,siblingIndex:1,fields:{FunOrderValue:1}},
    ]
    await fixture.owner.applyLeafMoveBatch({beforeTree:before,commands,expectedTree:expected})
    expect(fixture.saveRequests).toHaveLength(1)
    expect([...fixture.saveRequests[0]?.ids??[]].sort()).toEqual(['NAV-BOUND','NAV-BOUND-2','NAV-OTHER'])
    expect(findNode(fixture.owner.treeProjection(),'NAV-BOUND-2')?.parentNodeId).toBe('NAV-GROUP')
    expect(fixture.owner.dirty).toBe(false)
  })

  it('keeps an unknown multi-row move receipt pending and verifies the original ids without replay',async()=>{
    const fixture=createFixture({unknownFirstSave:true})
    const before=await fixture.owner.loadProjectTree(),group=findNode(before,'NAV-GROUP'),bound=findNode(before,'NAV-BOUND'),bound2=findNode(before,'NAV-BOUND-2'),other=findNode(before,'NAV-OTHER')
    const expected={...before,children:[{...group,children:[withPosition(bound2,'NAV-GROUP',0)]},withPosition(other,'NAV-ROOT',1),withPosition(bound,'NAV-ROOT',2)]}
    const commands=[
      {kind:'move' as const,nodeId:'NAV-BOUND',previousParentNodeId:'NAV-GROUP',parentNodeId:'NAV-ROOT',depth:1,siblingIndex:2,fields:{prowid:'NAV-ROOT',FunOrderValue:2}},
      {kind:'move' as const,nodeId:'NAV-BOUND-2',previousParentNodeId:'NAV-ROOT',parentNodeId:'NAV-GROUP',depth:2,siblingIndex:0,fields:{prowid:'NAV-GROUP',FunOrderValue:0}},
      {kind:'reorder' as const,nodeId:'NAV-OTHER',previousParentNodeId:'NAV-ROOT',parentNodeId:'NAV-ROOT',depth:1,siblingIndex:1,fields:{FunOrderValue:1}},
    ]
    await expect(fixture.owner.applyLeafMoveBatch({beforeTree:before,commands,expectedTree:expected})).rejects.toThrow('transport timeout after apply')
    expect(fixture.owner.hasPendingBlueprintCommand).toBe(true)
    const originalIds=['NAV-BOUND','NAV-BOUND-2','NAV-OTHER']
    expect([...fixture.saveRequests[0]?.ids??[]].sort()).toEqual(originalIds)
    expect(()=>fixture.owner.cancel()).toThrow('不能取消')
    await fixture.owner.save()
    expect(fixture.saveRequests).toHaveLength(1)
    expect(fixture.verificationIds).toEqual([originalIds])
    expect(fixture.saveAttempts()).toBe(2)
    expect(fixture.writeCount()).toBe(1)
    expect(fixture.owner.hasPendingBlueprintCommand).toBe(false)
    expect(fixture.owner.dirty).toBe(false)
  })

  it('fences an old selected-row query when a newer selection arrives',async()=>{
    const fixture=createFixture(),gate=fixture.holdNextQuery()
    const oldLoad=fixture.owner.load('NAV-BOUND')
    await gate.started
    const newLoad=fixture.owner.load('NAV-GROUP')
    gate.release()
    await expect(oldLoad).rejects.toThrow('结果已过期')
    await newLoad
    expect(fixture.owner.nodeId).toBe('NAV-GROUP')
    expect(fixture.owner.row?.['rowid']).toBe('NAV-GROUP')
  })

  it('fails closed when a returned tree row references a missing parent',async()=>{
    const fixture=createFixture({orphan:true})
    await expect(fixture.owner.moveNode('NAV-BOUND','NAV-ROOT',0)).rejects.toThrow('父节点闭包缺失')
    expect(fixture.owner.dirty).toBe(false)
    expect(fixture.saveRequests).toHaveLength(0)
  })

  it('maps the synthetic root target to the formal root parent identity',async()=>{
    const fixture=createFixture()
    await fixture.owner.moveNode('NAV-BOUND','project-blueprint:APP-1',0)
    expect(fixture.view.getEditingRow('NAV-BOUND')?.['prowid']).toBe('000000')
    expect(fixture.owner.treeProjection().children.map(node=>node.nodeId)).toContain('NAV-BOUND')
  })

  it('rejects a tree move when the DataView total differs from returned rows',async()=>{
    const fixture=createFixture({totalDelta:1})
    await expect(fixture.owner.moveNode('NAV-BOUND','NAV-ROOT',0)).rejects.toThrow('总数与行数不一致')
    expect(fixture.owner.dirty).toBe(false)
    expect(fixture.saveRequests).toHaveLength(0)
  })

  it('rejects a tree move when the backend omits the total',async()=>{
    const fixture=createFixture({omitTotal:true})
    await expect(fixture.owner.moveNode('NAV-BOUND','NAV-ROOT',0)).rejects.toThrow('总数与行数不一致或未确认')
    expect(fixture.owner.dirty).toBe(false)
    expect(fixture.saveRequests).toHaveLength(0)
  })

  it('retains an authorized funCode in the tree projection',async()=>{
    const fixture=createFixture({outputFields:FIELDS})
    const tree=await fixture.owner.loadProjectTree()
    expect(fixture.owner.hasOutput('funCode')).toBe(true)
    expect(findNode(tree,'NAV-BOUND')?.capability.code).toBe('DATA-SPACE-MANAGE')
  })

  it('keeps original move ids fenced through unknown save and rejects a stale project scope',async()=>{
    let current=true
    const fixture=createFixture({unknownFirstSave:true})
    const owner=new BlueprintWorkspaceDataView(fixture.dataSet,PROJECT,()=>{if(!current)throw new Error('scope switched')})
    await owner.moveNode('NAV-BOUND','NAV-ROOT',0)
    await expect(owner.save()).rejects.toThrow('transport timeout after apply')
    expect(owner.hasUnconfirmedSave).toBe(true)
    expect(()=>owner.cancel()).toThrow('不能取消')
    await owner.save()
    expect(fixture.saveRequests[0]?.ids).toContain('NAV-BOUND')
    expect(fixture.writeCount()).toBe(1)
    current=false
    await expect(owner.moveNode('NAV-BOUND','NAV-ROOT',1)).rejects.toThrow('scope switched')
    expect(fixture.writeCount()).toBe(1)
  })
})
