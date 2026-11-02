import {afterEach, describe, expect, it} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus from 'element-plus'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {Spark, PAGE_RUNTIME, RendererForm, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'

let wrapper: VueWrapper | undefined, runtime: PageRuntime | undefined
const originalStubs = {...config.global.stubs}
afterEach(() => {wrapper?.unmount();runtime?.dispose();config.global.stubs = originalStubs})
async function fixture() {
  registerAllRenderers()
  const baseline = JSON.stringify([{Name:'root',Type:'table',ChildTables:[{Name:'child',Type:'dict',unknown:{x:1}}]}])
  const ds = SparkData.fromJson({scenarioId:'S',tables:{Design:{resourceType:'static-data',columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'json',type:'string'}],
    views:{default:{commitMode:'staged',rows:[{id:'a',json:baseline},{id:'b',json:'[]'}]}}}}})
  runtime = new PageRuntime({pageId:'outline',scenarioIds:['S'],loadScenario:async()=>ds});await runtime.load()
  const view=ds.getView('Design')!;view.setCurrentRowById('a')
  const path=ref<ReadonlyArray<string|number>|null>(null)
  const host=defineComponent({setup(){useSparkComponent({type:'outline-host'}).sparkProvide(PAGE_RUNTIME,runtime!)
    return()=>h(RendererForm,{dataViewKey:'S@Design@default',autoColumns:false,showDataViewMeta:false,children:[{
      type:'r-json',props:{field:'json',mode:'outline',outlineChildrenField:'ChildTables',selectedPath:path.value,
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
  it('clears a selected path when its original bound row changes',async()=>{
    const f=await fixture()
    await f.wrapper.findAll('.el-table__body-wrapper tbody tr')[1]!.trigger('click');await flushPromises()
    f.view.setCurrentRowById('b');await flushPromises()
    expect(f.path.value).toBeNull()
    expect(f.wrapper.text()).not.toContain('child')
    expect(f.view.hasEditingChanges()).toBe(false)
  })
})
