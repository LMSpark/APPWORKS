import {afterEach,describe,expect,it} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {defineComponent,h,onBeforeUnmount} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet,RequestState} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME,RendererTable,Spark,useSparkComponent} from '@spark-appworks/spark-component'
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
