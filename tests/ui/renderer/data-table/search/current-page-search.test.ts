import {afterEach,expect,it,vi} from 'vitest'
import {config,flushPromises,mount} from '@vue/test-utils'
import {defineComponent,h,shallowRef,toRaw} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet} from '@spark-appworks/spark-data'
import {FieldText,RendererTable,Spark,PAGE_RUNTIME,useSparkComponent} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {ApiBackend} from '../../../../runtime/page/api-provider/api-provider.fixture'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
const originalStubs=config.global.stubs,cleanups:(()=>void)[]=[]
afterEach(()=>{cleanups.splice(0).reverse().forEach(cleanup=>cleanup());config.global.stubs=originalStubs;vi.unstubAllGlobals()})
async function fixture(nested=false,keyless=false){
 const stubs={...config.global.stubs};for(const name of ['el-table','el-table-column','SparkComponentRenderer','spark-component-renderer'])delete stubs[name];config.global.stubs=stubs
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
 const ds=DataSet.fromJson({scenarioId:'SPACE',dataSetName:'Search',tables:{Items:{tableName:'Items',modelBinding:{modelId:'ITEMS',modelName:'Items'},columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'name',type:'string'},{name:'secret',type:'string'},{name:'masked',type:'string'}],views:{default:{autoSelectFirst:false},other:{autoSelectFirst:false}}}}})
 const http=new ApiBackend();http.records['Items']=[{id:'one',name:'Alpha',secret:'hidden needle',masked:'masked needle'},{id:'two',name:'Beta',secret:'another',masked:'another'}]
 http.primaryKeys['Items']=keyless?'':'id';http.hiddenFields['Items']=['secret'];http.maskedFields['Items']=['masked']
 const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
 for(const id of ['default','other']){const view=ds.getView('Items',id)!;view.bindQueryExecutor(api);await view.refresh();if(view.loadingError)throw view.loadingError}
 if(keyless)ds.getView('Items')!.configure({selectionDelimiter:',',valueField:'id',labelField:'name'})
 if(nested)ds.getView('Items')!.rows[0]!['children']=[{id:'child',name:'nested'}]
 const runtime=new PageRuntime({pageId:'search-test',scenarioIds:['SPACE'],loadScenario:async()=>ds});await runtime.load();cleanups.push(()=>runtime.dispose())
 const binding=shallowRef('SPACE@Items@default'),registry=Spark.createRegistry();registry.register({type:'r-text',component:FieldText})
 const Host=defineComponent({setup(){useSparkComponent({type:'search-test-host'}).sparkProvide(PAGE_RUNTIME,runtime);return()=>h(RendererTable,{dataViewKey:binding.value,autoColumns:true,showDataViewMeta:false,showPagination:false,currentPageSearch:{fields:['name','secret','masked'],placeholder:'搜索当前页名称'}})}})
 const wrapper=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus,Spark.createPlugin({registry})]}});cleanups.push(()=>wrapper.unmount());await flushPromises()
 return{wrapper,binding,http,view:ds.getView('Items')!}
}
it('searches only the presented page with original row identity and no query, draft or selection changes',async()=>{
 const f=await fixture(),before=f.http.reads.length,rows=[...f.view.rows],total=f.view.total
 f.view.setCurrentRow(rows[1]!);f.view.setSelectedRows([rows[1]!]);await flushPromises()
 await f.wrapper.get('input[aria-label="搜索当前页名称"]').setValue('  ALpHa  ');await flushPromises()
 const shown=f.wrapper.getComponent({name:'ElTable'}).props('data')
 expect(shown).toHaveLength(1);expect(toRaw(shown[0])).toBe(toRaw(rows[0]));expect(f.view.rows).toEqual(rows);expect(f.view.total).toBe(total)
 expect(toRaw(f.view.currentRow)).toBe(toRaw(rows[1]));expect(f.view.getSelectedValues()).toEqual(['two'])
 expect(f.http.reads).toHaveLength(before);expect(f.http.saves).toHaveLength(0);expect(f.view.filterExpression).toBeUndefined();expect(f.view.hasEditingChanges()).toBe(false)
 await f.wrapper.get('input[aria-label="搜索当前页名称"]').setValue('');await flushPromises();expect(f.wrapper.getComponent({name:'ElTable'}).props('data')).toHaveLength(2)
})
it('does not use hidden or masked source values to disclose matching rows',async()=>{
 const f=await fixture()
 for(const needle of ['hidden needle','masked needle']){await f.wrapper.get('input[aria-label="搜索当前页名称"]').setValue(needle);await flushPromises();expect(f.wrapper.getComponent({name:'ElTable'}).props('data')).toHaveLength(0)}
})
it('clears the presentation search when its full view binding changes',async()=>{
 const f=await fixture();await f.wrapper.get('input[aria-label="搜索当前页名称"]').setValue('Alpha');await flushPromises()
 f.binding.value='SPACE@Items@other';await flushPromises();expect(f.wrapper.get('input[aria-label="搜索当前页名称"]').element).toHaveProperty('value','');expect(f.wrapper.getComponent({name:'ElTable'}).props('data')).toHaveLength(2)
})
it('matches the native editing overlay without copying it into the original row',async()=>{
 const f=await fixture(),row=f.view.rows[0]!
 await f.wrapper.get('input[aria-label="搜索当前页名称"]').setValue('draft');await flushPromises();expect(f.wrapper.getComponent({name:'ElTable'}).props('data')).toHaveLength(0)
 f.view.updateEditingValue('one','name','draft');await flushPromises()
 expect(f.wrapper.getComponent({name:'ElTable'}).props('data')).toHaveLength(1);expect(row['name']).toBe('Alpha');expect(f.view.getEditingPatch('one')).toMatchObject({name:'draft'})
})
it('clears search after query scope changes without issuing a query itself',async()=>{
 const f=await fixture(),before=f.http.reads.length
 await f.wrapper.get('input[aria-label="搜索当前页名称"]').setValue('Alpha');await flushPromises()
 f.view.configure({queryContext:{category:'different'}});await flushPromises()
 expect(f.wrapper.get('input[aria-label="搜索当前页名称"]').element).toHaveProperty('value','');expect(f.http.reads).toHaveLength(before)
})
it('preserves hidden selections when explicitly selecting or deselecting a visible match',async()=>{
 const f=await fixture(),rows=[...f.view.rows];f.view.configure({selectionDelimiter:','});f.view.setSelectedRows([rows[1]!]);await flushPromises()
 await f.wrapper.get('input[aria-label="搜索当前页名称"]').setValue('Alpha');await flushPromises()
 f.wrapper.getComponent({name:'ElTable'}).vm.$emit('selection-change',[rows[0]!]);await flushPromises();expect(f.view.getSelectedValues()).toEqual(['two','one'])
 f.wrapper.getComponent({name:'ElTable'}).vm.$emit('selection-change',[]);await flushPromises();expect(f.view.getSelectedValues()).toEqual(['two'])
})
it('rejects nested rows even when no treeConfig is declared',async()=>{
 await expect(fixture(true)).rejects.toThrow('TABLE_PAGE_SEARCH')
})
it('releases old view listeners when switching the full binding',async()=>{
 const f=await fixture();f.binding.value='SPACE@Items@other';await flushPromises()
 await f.wrapper.get('input[aria-label="搜索当前页名称"]').setValue('Beta');await flushPromises()
 f.view.configure({queryContext:{category:'old scope'}});await flushPromises()
 expect(f.wrapper.get('input[aria-label="搜索当前页名称"]').element).toHaveProperty('value','Beta')
})
it('preserves keyless hidden selections through real visible table checkboxes',async()=>{
 const f=await fixture(false,true),rows=[...f.view.rows];expect(f.view.primaryKey).toBe('')
 f.view.setSelectedRows([rows[1]!]);await flushPromises()
 await f.wrapper.get('input[aria-label="搜索当前页名称"]').setValue('Alpha');await flushPromises()
 await f.wrapper.get('tbody input[type="checkbox"]').setValue(true);await flushPromises()
 expect(f.view.selectedRows.map(row=>row['id'])).toEqual(['two','one'])
 await f.wrapper.get('tbody input[type="checkbox"]').setValue(false);await flushPromises()
 expect(f.view.selectedRows).toEqual([rows[1]])
})
