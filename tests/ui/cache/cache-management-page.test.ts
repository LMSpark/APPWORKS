import {afterEach,expect,it,vi} from 'vitest'
import {existsSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {mount,flushPromises,config} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {defineComponent,h,reactive} from 'vue'
import {DataSet,bindDataSetCommandSubmit,type DataRow} from '@spark-appworks/spark-data'
import {Spark,RendererTable,RendererButton,RendererToolbar,FieldText,type RToolbarProps} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import Page from '@/views/features/system/cache-management/ui/cache-management-page.vue'

const mocks=vi.hoisted(()=>({load:vi.fn(),route:{path:'/apps/APP/features/system/cache-management/ui/cache-management-page',meta:{blueprintScenarioId:'348D1C50B204C779AABBE2489C5E2FDF',nodeId:'CACHE_NODE',systemPageIdentityState:'resolved'}}}))
vi.mock('vue-router',()=>({useRoute:()=>route}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime',()=>({loadLowcodeRuntimeScenario:mocks.load}))
vi.mock('@spark-appworks/spark-app',async()=>{
 const {NativePageRuntimeSession}=await import('../../../packages/spark-app/src/router/native-page-runtime-session')
 return {NativePageRuntimeSession,useSystemPageDirtySource:()=>undefined}
})
const cleanups:(()=>void)[]=[]
const originalStubs=config.global.stubs
const route=reactive(mocks.route)
afterEach(()=>{cleanups.splice(0).reverse().forEach(fn=>fn());config.global.stubs=originalStubs;vi.unstubAllGlobals();route.path='/apps/APP/features/system/cache-management/ui/cache-management-page';route.meta.nodeId='CACHE_NODE';vi.clearAllMocks()})
async function dataFixture(keyless=false){
 const scene='348D1C50B204C779AABBE2489C5E2FDF'
 const ds=DataSet.fromJson({scenarioId:scene,tables:{
  CacheCategories:{modelBinding:{modelId:'84e3c2b4-0df0-4b5d-b148-885c7c812baf',modelName:'缓存过滤条件'},columns:[{name:'txt',type:'string'},{name:'val',type:'string'}],views:{default:{autoLoad:false,queryConfig:{pagination:'none'}}}},
  CacheEntries:{modelBinding:{modelId:'4f22a823-4da7-472c-8b0e-5dc8a7c23b18',modelName:'获取缓存信息'},columns:[...(keyless?[]:[{name:'sourceId',type:'string',isPrimaryKey:true}]),{name:'cacheKey',type:'string'},{name:'cacheValue',type:'string'}],views:{default:{autoLoad:false,queryConfig:{pagination:'none'}}}},
  CacheDeleteRequest:{resourceType:'command',resourceId:'system:cache-delete',columns:[{name:'commandId',type:'string',isPrimaryKey:true},{name:'key',type:'string'},{name:'outcome',type:'string'}],views:{default:{autoLoad:false,commitMode:'staged',queryConfig:{pagination:'none'}}}},
 }})
 const list=ds.getView('CacheEntries')!,commands=ds.getView('CacheDeleteRequest')!,submit=vi.fn(async()=>({commandId:'ONE',key:'A',outcome:'confirmed'}))
 list.bindQueryExecutor({executeQuery:async()=>({rows:[{...(keyless?{}:{sourceId:'ROW-A'}),cacheKey:'A',cacheValue:'value'}],total:1,resultPrimaryKey:keyless?'':'sourceId',assertIdentity:()=>undefined,rowKey:row=>row['sourceId'],
  fieldAccess:()=>({read:'visible' as const,write:'denied' as const,component:'readonly' as const,required:false,writeMode:'readonly' as const}),readFieldAccess:()=> 'visible' as const,
  addActionState:()=> 'hidden',editActionState:()=> 'hidden',deleteActionState:()=> keyless?'hidden':'enabled',createChildActionState:()=> 'hidden',viewActionState:()=> 'enabled'})})
 await list.refresh()
 const categories=ds.getView('CacheCategories')!
 categories.bindQueryExecutor({executeQuery:async()=>({rows:[],total:0,assertIdentity:()=>undefined,rowKey:()=>undefined,fieldAccess:()=>({read:'visible' as const,write:'denied' as const,component:'readonly' as const,required:false,writeMode:'readonly' as const}),readFieldAccess:()=> 'visible' as const,addActionState:()=> 'hidden',editActionState:()=> 'hidden',deleteActionState:()=> 'hidden',createChildActionState:()=> 'hidden',viewActionState:()=> 'enabled'})})
 const verify=vi.fn(async()=>{throw Error('UNKNOWN')})
 bindDataSetCommandSubmit(commands,{resource:{resourceType:'command',resourceId:'system:cache-delete'},inputFields:['key'],guard:()=>undefined,createKey:()=> 'ONE',submit,verify,isUnconfirmed:failure=>failure instanceof Error&&failure.message==='UNKNOWN'})
 return{ds,list,commands,submit,verify}
}
async function fixture(realTable=false,keyless=false){
 const data=await dataFixture(keyless)
 mocks.load.mockResolvedValue(data.ds)
 const TableStub=defineComponent({name:'RendererTable',props:['dataViewKey','actions','children','currentPageSearch'],setup:()=>()=>h('div',{'data-standard-table':''})})
 const ButtonStub=defineComponent({name:'RendererButton',props:['label','disabled'],emits:['click'],setup:(props,{emit})=>()=>h('button',{disabled:props['disabled'],onClick:()=>emit('click')},String(props['label']))})
 const DialogStub=defineComponent({name:'RendererDialog',setup:(_,{slots})=>()=>h('div',[slots['default']?.(),slots['footer']?.()])})
 const registry=Spark.createRegistry()
 registry.register({type:'r-text',component:FieldText});registry.register({type:'r-button',component:RendererButton});registry.register({type:'r-toolbar',component:RendererToolbar})
 if(realTable){
  const stubs={...config.global.stubs}
  for(const name of ['el-table','el-table-column','el-button','SparkComponentRenderer','spark-component-renderer'])delete stubs[name]
  config.global.stubs=stubs
  vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
 }
 const wrapper=mount(Page,{global:{plugins:[ElementPlus,Spark.createPlugin({registry})],stubs:{RendererTable:realTable?false:TableStub,RendererButton:realTable?false:ButtonStub,RendererDialog:DialogStub,RendererForm:true,FieldText:!realTable}}})
 cleanups.push(()=>wrapper.unmount());await flushPromises()
 return{wrapper,...data}
}
async function activateDelete(actions:RToolbarProps|undefined,row:DataRow|undefined):Promise<void>{
 const node=actions?.children?.[0]
 if(!node||typeof node!=='object'||!row)throw Error('Missing original row action')
 const click=node.props?.['onClick']
 if(typeof click!=='function')throw Error('Missing original delete callback')
 await click(row)
}
it('hosts the cache manager runtime through the shared native session',()=>{
 const source=readFileSync(resolve(process.cwd(),'src/views/features/system/cache-management/ui/cache-management-page.vue'),'utf8')
 expect(source).toContain('new NativePageRuntimeSession')
 expect(source).toContain('runtimeSession.isCurrent(current)')
 expect(source).toContain('loadLowcodeRuntimeScenario({projectId,scenarioId:id})')
 expect(source).not.toContain('new PageRuntime')
})
it('binds the original two workspaces, stages the row delete and cancels with zero command dispatch',async()=>{
 const f=await fixture(),tables=f.wrapper.findAllComponents(RendererTable)
 expect(tables).toHaveLength(2)
 expect(tables[0]!.props('dataViewKey')).toBe('348D1C50B204C779AABBE2489C5E2FDF@缓存过滤条件@default')
 expect(tables[1]!.props('currentPageSearch')).toEqual({fields:['cacheKey'],placeholder:'搜索当前页缓存键'})
 const actions=tables[1]!.props('actions')
 await activateDelete(actions,f.list.rows[0]);await flushPromises()
 expect(f.commands.rows[0]?.['key']).toBe('A');expect(f.submit).not.toHaveBeenCalled()
 const cancel=f.wrapper.findAll('button').find(button=>button.text()==='取消删除')
 expect(cancel).toBeDefined();await cancel!.trigger('click');await flushPromises()
 expect(f.commands.rows).toEqual([]);expect(f.submit).not.toHaveBeenCalled()
})
it('confirms the original staged command through the shared record helper exactly once',async()=>{
 const f=await fixture(),table=f.wrapper.findAllComponents(RendererTable)[1]!
 await activateDelete(table.props('actions'),f.list.rows[0]);await flushPromises()
 await f.wrapper.findAll('button').find(button=>button.text()==='确定删除')!.trigger('click');await flushPromises()
 expect(f.submit).toHaveBeenCalledTimes(1);expect(f.commands.hasUnconfirmedSave).toBe(false)
 expect(f.wrapper.text()).not.toContain('确定删除以下缓存键吗？')
})
it('keeps a lost receipt in the original dialog and verifies without a second dispatch',async()=>{
 const f=await fixture();f.submit.mockRejectedValueOnce(Error('UNKNOWN'))
 await activateDelete(f.wrapper.findAllComponents(RendererTable)[1]!.props('actions'),f.list.rows[0]);await flushPromises()
 await f.wrapper.findAll('button').find(button=>button.text()==='确定删除')!.trigger('click');await flushPromises()
 expect(f.submit).toHaveBeenCalledTimes(1);expect(f.commands.hasUnconfirmedSave).toBe(true)
 const destroy=vi.spyOn(f.ds,'destroy')
 route.path='/apps/OTHER/features/system/cache-management/ui/cache-management-page';await flushPromises()
 expect(destroy).not.toHaveBeenCalled();expect(mocks.load).toHaveBeenCalledTimes(1)
 expect(f.wrapper.findAll('button').find(button=>button.text()==='切换到当前导航')!.attributes('disabled')).toBeDefined()
 expect(f.wrapper.findAll('button').find(button=>button.text()==='取消删除')!.attributes('disabled')).toBeDefined()
 await f.wrapper.findAll('button').find(button=>button.text()==='核验原删除结果')!.trigger('click');await flushPromises()
 expect(f.verify).toHaveBeenCalledTimes(1);expect(f.submit).toHaveBeenCalledTimes(1);expect(f.commands.hasUnconfirmedSave).toBe(true)
})
it('takes the authorized original source row from a real standard table action',async()=>{
 const f=await fixture(true)
 const button=f.wrapper.findAll('button').find(item=>item.text()==='删除')
 expect(button).toBeDefined();await button!.trigger('click');await flushPromises()
 expect(f.commands.rows[0],f.wrapper.text()).toMatchObject({key:'A'});expect(f.submit).not.toHaveBeenCalled()
})
it('disables the real standard table action when a keyless row has no delete authorization',async()=>{
 const f=await fixture(true,true)
 const button=f.wrapper.findAll('button').find(item=>item.text()==='删除')
 expect(button).toBeDefined();expect(button!.attributes('disabled')).toBeDefined()
 await button!.trigger('click');await flushPromises()
 expect(f.commands.rows).toEqual([]);expect(f.submit).not.toHaveBeenCalled()
})
it('rejects a direct stale or unauthorized row callback before staging',async()=>{
 const f=await fixture(false,true),table=f.wrapper.findAllComponents(RendererTable)[1]!
 await activateDelete(table.props('actions'),f.list.rows[0]);await flushPromises()
 expect(f.wrapper.text()).toContain('当前缓存无法确认删除权限')
 expect(f.commands.rows).toEqual([]);expect(f.submit).not.toHaveBeenCalled()
})
it('preserves an open command across route changes and explicitly continues to the new target after cancel',async()=>{
 const f=await fixture(),destroy=vi.spyOn(f.ds,'destroy')
 await activateDelete(f.wrapper.findAllComponents(RendererTable)[1]!.props('actions'),f.list.rows[0]);await flushPromises()
 route.path='/apps/OTHER/features/system/cache-management/ui/cache-management-page';route.meta.nodeId='NEW_CACHE_NODE';await flushPromises()
 expect(destroy).not.toHaveBeenCalled();expect(mocks.load).toHaveBeenCalledTimes(1);expect(f.submit).not.toHaveBeenCalled()
 await f.wrapper.findAll('button').find(button=>button.text()==='取消删除')!.trigger('click');await flushPromises()
 const next=await dataFixture();mocks.load.mockResolvedValueOnce(next.ds)
 await f.wrapper.findAll('button').find(button=>button.text()==='切换到当前导航')!.trigger('click');await flushPromises()
 expect(mocks.load).toHaveBeenLastCalledWith({projectId:'OTHER',scenarioId:'348D1C50B204C779AABBE2489C5E2FDF'})
 expect(destroy).toHaveBeenCalledTimes(1);expect(next.ds.destroyed).toBe(false);expect(f.submit).not.toHaveBeenCalled()
})
it('routes the original cache URL to its business page and keeps no separate cache tool',()=>{
 const source:unknown=JSON.parse(readFileSync('config/navigation/vue-pages.json','utf8'))
 if(!isRecord(source)||!Array.isArray(source['pages']))throw Error('Missing page registry')
 const pages=source['pages'].filter(isRecord)
 expect(pages.find(page=>page['path']==='/features/system/cache-management/ui/cache-management-page')?.['source']).toBe('src/views/features/system/cache-management/ui/cache-management-page.vue')
 expect(pages.find(page=>page['path']==='/cache-manager')).toBeUndefined()
 expect(existsSync(resolve(process.cwd(),'src/views/app/CacheManager.vue'))).toBe(false)
})
