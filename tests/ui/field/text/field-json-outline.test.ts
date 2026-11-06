import {afterEach, describe, expect, it} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus from 'element-plus'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, PAGE_RUNTIME, RendererForm, FieldJson, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'

import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

let wrapper: VueWrapper | undefined, runtime: PageRuntime | undefined
const originalStubs = {...config.global.stubs}
afterEach(() => {wrapper?.unmount();runtime?.dispose();config.global.stubs = originalStubs})
async function fixture(options:{baseline?:string;outline?:Record<string,unknown>;standalone?:boolean;visibility?:'masked'|'hidden'}={}) {
  registerAllRenderers()
  const baseline = options.baseline??JSON.stringify([{Name:'root',Type:'table',ChildTables:[{Name:'child',Type:'dict',unknown:{x:1}}]}])
  const ds = SparkData.fromJson({scenarioId:'S',tables:{Design:{...(options.visibility?{modelBinding:{modelId:'M',modelName:'Design'}}:{}),resourceType:'static-data',columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'json',type:'string'}],
    views:{default:{commitMode:'staged',rows:[{id:'a',json:baseline},{id:'b',json:'[]'}]}}}}})
  runtime = new PageRuntime({pageId:'outline',scenarioIds:['S'],loadScenario:async()=>ds});await runtime.load()
  const view=ds.getView('Design')!
  if(options.visibility){
    const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'Design'})
    view.bindQueryExecutor({executeQuery:async()=>new DataSpaceQueryContext({identity:table.identity,scope:'query',readScope:()=> 'query',
      snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Items:[{id:'a',json:baseline,lingma_sys_params:{m:options.visibility==='masked'?['json']:[],h:options.visibility==='hidden'?['json']:[],e:options.visibility==='hidden'?['json']:[]}}],Count:1}}})})})
    await view.loadFromServer()
  }
  view.setCurrentRowById('a')
  const path=ref<ReadonlyArray<string|number>|null>(null)
  const host=defineComponent({setup(){useSparkComponent({type:'outline-host'}).sparkProvide(PAGE_RUNTIME,runtime!)
    return()=>options.standalone?h(FieldJson,{dataViewKey:'S@Design@default',field:'json',mode:'outline',outlineChildrenField:'ChildTables',readonly:true,children:[{type:'r-text',props:{field:'Name',label:'名称'}}]}):h(RendererForm,{dataViewKey:'S@Design@default',autoColumns:false,showDataViewMeta:false,children:[{
      type:'r-json',props:{field:'json',mode:'outline',outlineChildrenField:'ChildTables',...options.outline,selectedPath:path.value,
        onSelectedPathChange:(value:ReadonlyArray<string|number>|null)=>{path.value=value}},children:[
        {type:'r-text',props:{field:'Type',label:'类型'}},{type:'r-text',props:{field:'Name',label:'名称'}},
      ],
    }]})}})
  const stubs={...config.global.stubs};for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete stubs[key]
  config.global.stubs=stubs
  wrapper=mount(host,{attachTo:document.body,global:{plugins:[ElementPlus,Spark.createPlugin()],stubs}})
  await flushPromises();return {view,path,baseline,wrapper}
}
describe('bound JSON outline',()=>{
  it.each(['masked','hidden'] as const)('preserves formal %s field presentation in detail context',async visibility=>{
    const f=await fixture({standalone:true,visibility})
    expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(0)
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(f.wrapper.text()).not.toContain('child')
    expect(f.wrapper.text()).not.toContain(f.baseline)
    if(visibility==='masked')expect(f.wrapper.text()).toContain('••••')
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('renders the configured readonly outline outside an editing form without exposing raw JSON or writing',async()=>{
    const f=await fixture({standalone:true})
    expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(2)
    expect(f.wrapper.text()).toContain('root');expect(f.wrapper.text()).toContain('child')
    expect(f.wrapper.text()).not.toContain(f.baseline)
    expect(f.wrapper.find('input').exists()).toBe(false)
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.view.rows[0]?.['json']).toBe(f.baseline)
    f.view.setCurrentRowById('b');await flushPromises()
    expect(f.wrapper.text()).not.toContain('child')
    expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(0)
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('projects a flat parent relation without rewriting the array or losing original selection paths',async()=>{
    const baseline=JSON.stringify([{rowid:'child',pid:'root',Name:'flat child',Type:'query',unknown:{keep:true}},{rowid:'root',pid:null,Name:'flat root',Type:'merge'}])
    const f=await fixture({baseline,outline:{outlineChildrenField:undefined,outlineIdField:'rowid',outlineParentField:'pid'}})
    const rows=f.wrapper.findAll('.el-table__body-wrapper tbody tr')
    expect(rows).toHaveLength(2);expect(rows[0]!.text()).toContain('flat root');expect(rows[1]!.text()).toContain('flat child')
    await rows[1]!.trigger('click');await flushPromises();expect(f.path.value).toEqual([0])
    expect(f.view.getEditingRow('a')?.['json']).toBe(baseline);expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.wrapper.find('input').exists()).toBe(false)
  })
  it('keeps numeric and string identities distinct, including numeric zero as a parent',async()=>{
    const f=await fixture({baseline:JSON.stringify([{rowid:0,pid:null,Name:'number root'},{rowid:'0',pid:0,Name:'string child'}]),outline:{outlineChildrenField:undefined,outlineIdField:'rowid',outlineParentField:'pid'}})
    const rows=f.wrapper.findAll('.el-table__body-wrapper tbody tr');expect(rows).toHaveLength(2)
    await rows[1]!.trigger('click');await flushPromises();expect(f.path.value).toEqual([1]);expect(f.view.hasEditingChanges()).toBe(false)
  })
  it.each([
    {records:[{rowid:'A',pid:null},{rowid:'A',pid:null}],message:'重复'},
    {records:[{rowid:'A',pid:'missing'}],message:'父项'},
    {records:[{rowid:'A',pid:'B'},{rowid:'B',pid:'A'}],message:'循环'},
    {records:[{rowid:'A',pid:'A'}],message:'循环'},
    {records:[{rowid:{bad:true},pid:null}],message:'身份'},
    {records:[{rowid:'A',pid:{bad:true}}],message:'父项身份'},
  ])('reports invalid flat identities or hierarchy and preserves original JSON: $message',async({records,message})=>{
    const baseline=JSON.stringify(records),f=await fixture({baseline,outline:{outlineChildrenField:undefined,outlineIdField:'rowid',outlineParentField:'pid'}})
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(f.wrapper.find('[role="alert"]').text()).toContain(message)
    expect(f.wrapper.findAll('.el-table__body-wrapper tbody tr')).toHaveLength(0)
    expect(f.view.rows[0]?.['json']).toBe(baseline);expect(f.view.hasEditingChanges()).toBe(false)
  })
  it.each([
    {outlineChildrenField:undefined,outlineIdField:'rowid'},
    {outlineIdField:'rowid',outlineParentField:'pid'},
  ])('rejects an incomplete or mixed hierarchy contract without writing configuration',async outline=>{
    const f=await fixture({baseline:'[{"rowid":"A","pid":null,"Name":"kept"}]',outline})
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(f.view.rows[0]?.['json']).toBe(f.baseline);expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('selects a nested object by exact JSON path without creating field edits',async()=>{
    const f=await fixture()
    const rows=f.wrapper.findAll('.el-table__body-wrapper tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[1]!.text()).toContain('child')
    await rows[1]!.trigger('click');await flushPromises()
    expect(f.path.value).toEqual([0,'ChildTables',0])
    expect(f.view.hasEditingChanges()).toBe(false)
    expect(f.view.rows[0]?.['json']).toBe(f.baseline)
    expect(f.wrapper.find('input').exists()).toBe(false)
  })
  it.each(['nested','flat'])('clears a selected path when its original bound row changes: %s',async kind=>{
    const f=await fixture(kind==='flat'?{baseline:'[{"rowid":"R","pid":null,"Name":"root"},{"rowid":"C","pid":"R","Name":"child"}]',outline:{outlineChildrenField:undefined,outlineIdField:'rowid',outlineParentField:'pid'}}:{})
    await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[1]!.trigger('click');await flushPromises()
    f.view.setCurrentRowById('b');await flushPromises()
    expect(f.path.value).toBeNull()
    expect(f.wrapper.text()).not.toContain('child')
    expect(f.view.hasEditingChanges()).toBe(false)
  })
})
