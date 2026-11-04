import {afterEach,describe,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {defineComponent,effectScope,h,onBeforeUnmount,shallowRef} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet,RequestState} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME,RendererTable,Spark,useSparkComponent} from '@spark-appworks/spark-component'
import {useDataViewState} from '../../../packages/spark-component/src/components/containers/data-views/view-runtime-state'
import DataViewMetaBar from '../../../packages/spark-component/src/components/containers/data-views/DataViewMetaBar.vue'

const wrappers:VueWrapper[]=[]
afterEach(()=>wrappers.splice(0).forEach(wrapper=>wrapper.unmount()))

describe('data errors without diagnostic metadata',()=>{
 it('shows a failed native DataView query in the bound standard table without enabling operations or showing metadata',async()=>{
  const dataSet=DataSet.fromJson({scenarioId:'ERRORS',tables:{Records:{modelBinding:{modelId:'records-model',modelName:'Records'},columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{}}}}})
  const view=dataSet.getView('Records')!,message='权限不足，当前用户未获得资源 Base_JsonData 的查询权限'
  view.bindQueryExecutor({executeQuery:async()=>{throw new Error(message)}})
  await view.refresh();expect(view.requestState).toBe(RequestState.Failed)
  const runtime=new PageRuntime({pageId:'error-table',scenarioIds:['ERRORS'],loadScenario:async()=>dataSet});await runtime.load()
  const Host=defineComponent({setup(){useSparkComponent({type:'error-table-host'}).sparkProvide(PAGE_RUNTIME,runtime);onBeforeUnmount(()=>runtime.dispose());return()=>h(RendererTable,{dataViewKey:'ERRORS@Records@default',autoColumns:false,showPagination:false,showDataViewMeta:false})}})
  const wrapper=mount(Host,{global:{plugins:[ElementPlus,Spark.createPlugin()]}});wrappers.push(wrapper);await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe(message)
  expect(wrapper.find('[data-testid="data-view-meta"]').exists()).toBe(false)
  expect(view.rows).toEqual([]);expect(view.addActionState()).not.toBe('enabled')
 })

 it.each(['loadingError','mutatingError'] as const)('keeps %s visible once across metadata toggles and removes it on recovery',async field=>{
  const wrapper=mount(DataViewMetaBar,{props:{showDataViewMeta:false,[field]:new Error('正式数据操作失败')}});wrappers.push(wrapper)
  expect(wrapper.get('[role="alert"]').text()).toBe('正式数据操作失败')
  expect(wrapper.find('[data-testid="data-view-meta"]').exists()).toBe(false)
  await wrapper.setProps({showDataViewMeta:true})
  expect(wrapper.text().match(/正式数据操作失败/g)).toHaveLength(1)
  await wrapper.setProps({showDataViewMeta:false,[field]:null})
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
 })
})


it.each([0, 3])('does not present fallback total %s as a reported count in the shared metadata bar', async total => {
 const wrapper=mount(DataViewMetaBar,{props:{total,countReported:false,requestState:RequestState.Loaded}});wrappers.push(wrapper)
 expect(wrapper.text()).toContain('未报告总数')
 expect(wrapper.text()).not.toContain(`总数 ${total}`)
 await wrapper.setProps({countReported:true})
 expect(wrapper.text()).toContain(`总数 ${total}`)
 expect(wrapper.text()).not.toContain('未报告总数')
 await wrapper.setProps({countReported:false})
 expect(wrapper.text()).toContain('未报告总数')
})


it('keeps undeclared count capability distinct from an explicitly unknown count', async () => {
 const wrapper=mount(DataViewMetaBar,{props:{total:7}});wrappers.push(wrapper)
 expect(wrapper.text()).toContain('总数 7')
 expect(wrapper.text()).not.toContain('未报告总数')
 await wrapper.setProps({countReported:false})
 expect(wrapper.text()).toContain('未报告总数')
 await wrapper.setProps({countReported:undefined})
 expect(wrapper.text()).toContain('总数 7')
})

it('bridges the original count capability across request updates and view rebinding without coercion', () => {
 const ds=DataSet.fromJson({scenarioId:'COUNTS',tables:{Records:{resourceType:'static-data',columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{rows:[{id:'a'}]},other:{rows:[]}}}}})
 const view=ds.getView('Records')!,other=ds.getView('Records','other')!,binding=shallowRef(view),scope=effectScope()
 const reported=vi.spyOn(view,'countReported','get').mockReturnValue(false)
 const state=scope.run(()=>useDataViewState(binding))!
 try {
  expect(state.countReported.value).toBe(false)
  reported.mockReturnValue(true);view.events.emit('requestStateChanged',RequestState.Loaded)
  expect(state.countReported.value).toBe(true)
  reported.mockReturnValue(false);view.events.emit('rowsChanged')
  expect(state.countReported.value).toBe(false)
  binding.value=other
  expect(state.countReported.value).toBeUndefined()
  binding.value=view
  expect(state.countReported.value).toBe(false)
 } finally {scope.stop();ds.destroy()}
})
