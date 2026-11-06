import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {DataView} from '@spark-appworks/spark-data'
import {createApiService,seed,API,CONFIG,META,pagedata} from './api-provider.fixture'
const api=vi.hoisted(()=>({current:undefined as unknown as ReturnType<typeof createApiService>}))
vi.mock('@/lowcode/lowcode-runtime',()=>({
 get lowcodeHttp(){return api.current.state.http},
 lowcodeApi:{readRequestScope:()=>api.current.service.readRequestScope(),dataSpace:{get design(){return api.current.service},get runtime(){return api.current.state.runtime}}},
 createLowcodeProjectGateways:()=>({scenarioViews:{readScope:()=> 'scope',readText:async(id:string)=>pagedata[id]??null,writeText:async()=>{throw Error('No file writes')}}}),
 lowcodeDesignFileUpload:async()=>{throw Error('No uploads')},
}))
const {loadLowcodeRuntimeScenario,loadScenarioDataSet}=await import('@/lowcode/data-space/lowcode-data-space-runtime')
const pages:PageRuntime[]=[]
beforeEach(()=>{api.current=createApiService();api.current.reset(seed)})
afterEach(()=>{pages.splice(0).forEach(p=>p.dispose());vi.restoreAllMocks()})
async function open(id=API,host=false){
 const p:PageRuntime=new PageRuntime({pageId:'api-domain-test',scenarioIds:host?[id,META]:[id],...(host?{deferredScenarioIds:[META]}:{}),scenarioInputs:{[id]:{providerId:'P1'}},loadScenario:scenarioId=>loadLowcodeRuntimeScenario({projectId:'APP',scenarioId,...(host?{getPage:()=>p}:{})})})
 pages.push(p);await p.load();return p.getDataSet(id)!
}
async function outputs(scenario=API,named=true,full=true,host=false){
 const ds=await open(scenario,host),original=ds.getView('Base_TblField')!,v=named?original.createQueryView('output-edit'):original
 v.commitMode='staged';if(full)v.queryConfig={fields:['rowid','tblid','enname','DataType','IsPKey','cnname','Memo'],allPages:true};v.filterExpression={field:'tblid',operator:'eq',value:'I1'};await v.refresh()
 return{ds,v,save:()=>ds.saveChanges({views:[{tableName:v.tableName,viewId:v.viewId}]})}
}
async function parameters(scenario:string){const ds=await open(scenario),v=ds.getView('Base_Interface_PublicParam')!;v.queryConfig={fields:['rowid','providerId','paramName','interfaceId','outputfield','interfaceName','accessPath','desc'],allPages:true};await v.refresh();return{ds,v}}
function directSave(v:DataView){return v.dataSet!.saveChanges({views:[{tableName:v.tableName,viewId:v.viewId}]})}
it('registers output structural rules through the official loader, without a page binder',async()=>{
 const {v,save}=await outputs();v.updateEditingValue('F1','IsPKey',2)
 await expect(save()).rejects.toThrow('Base_TblField@output-edit.IsPKey');expect(api.current.state.http.saves).toHaveLength(0)
})
it('rejects destructive output save without its original host, including a named view',async()=>{
 const {v,save}=await outputs();v.updateEditingValue('F1','enname','renamed')
 await expect(save()).rejects.toThrow('API_OUTPUT_HOST_REQUIRED');expect(api.current.state.http.saves).toHaveLength(0)
})
it('allows an ordinary title edit without a cross-space host or reference scan',async()=>{
 const {v,save}=await outputs(),reads=api.current.state.http.reads.length
 v.updateEditingValue('F1','cnname','新标题');expect((await save()).success).toBe(true)
 expect(api.current.state.http.reads.slice(reads).every(r=>!['Base_DataModel','Base_Interface_PublicParam'].includes(r.table))).toBe(true)
 expect(api.current.state.http.records['Base_TblField']![0]).toMatchObject({cnname:'新标题',tblname:'取令牌',Memo:null})
})
it.each([API,CONFIG])('rejects provider migration via direct DataSet save in %s',async scenario=>{
 const {v}=await parameters(scenario);v.updateEditingValue('Q1','providerId','P2')
 await expect(directSave(v)).rejects.toThrow();expect(api.current.state.http.saves).toHaveLength(0)
})
it.each([API,CONFIG])('rejects stale output bindings before any dispatch in %s',async scenario=>{
 const {v}=await parameters(scenario);v.updateEditingValue('Q1','outputfield','missing')
 await expect(directSave(v)).rejects.toThrow();expect(api.current.state.http.saves).toHaveLength(0)
})
it.each([true,false])('protects CONFIG output option edits through named=%s views',async named=>{
 const {v,save}=await outputs(CONFIG,named,false);v.updateEditingValue('F1','enname','renamed')
 await expect(save()).rejects.toThrow();expect(api.current.state.http.saves).toHaveLength(0)
})
it('rejects CONFIG output option creation explicitly before any dispatch',async()=>{
 const {v,save}=await outputs(CONFIG,true,false);await v.addRow({tblid:'I1',enname:'new_option',cnname:'新增'})
 await expect(save()).rejects.toThrow('API_OUTPUT_OPTION_CREATE');expect(api.current.state.http.saves).toHaveLength(0)
})
it('checks CONFIG output deletion even though no update validator runs',async()=>{
 const {v,save}=await outputs(CONFIG,true,false);await v.removeRow('F1')
 await expect(save()).rejects.toThrow();expect(api.current.state.http.saves).toHaveLength(0)
})
it('allows CONFIG output title changes without reading metadata or public parameters',async()=>{
 const {v,save}=await outputs(CONFIG,true,false),reads=api.current.state.http.reads.length
 v.updateEditingValue('F1','cnname','标题');expect((await save()).success).toBe(true)
 expect(api.current.state.http.reads.slice(reads).some(r=>['Base_DataModel','Base_Interface_PublicParam'].includes(r.table))).toBe(false)
})
it('loads metadata only for destructive saves and reuses the original deferred DataSet',async()=>{
 const {v,save}=await outputs(API,true,true,true),page=pages.at(-1)!
 api.current.state.http.records['Base_Interface_PublicParam']=[]
 expect(page.getDataSet(META)).toBeUndefined()
 v.updateEditingValue('F1','cnname','标题');expect((await save()).success).toBe(true);expect(page.getDataSet(META)).toBeUndefined()
 v.updateEditingValue('F1','enname','renamed');expect((await save()).success).toBe(true)
 const metadata=page.getDataSet(META);expect(metadata).toBeDefined()
 v.updateEditingValue('F1','enname','renamed_again');expect((await save()).success).toBe(true);expect(page.getDataSet(META)).toBe(metadata)
 expect(api.current.service.readSpaceDefinition.mock.calls.filter(([input])=>input.dataSpaceId===META)).toHaveLength(1)
})
it.each([true,false])('checks model consumers by provider and formal interface name, matches=%s',async matches=>{
 const {v,save}=await outputs(API,true,true,true);api.current.state.http.records['Base_Interface_PublicParam']=[]
 api.current.state.http.records['Base_DataModel']=[{rowid:'MODEL',Type:'接口',DbId:matches?'P1':'P2',MetaName:'取令牌'}]
 v.updateEditingValue('F1','DataType','int')
 if(matches){await expect(save()).rejects.toThrow('API_OUTPUT_REFERENCED');expect(api.current.state.http.saves).toHaveLength(0)}
 else expect((await save()).success).toBe(true)
})
it('rejects a referenced output before loading unrelated metadata',async()=>{
 const {v,save}=await outputs(API,true,true,true);v.updateEditingValue('F1','enname','renamed')
 await expect(save()).rejects.toThrow('API_OUTPUT_REFERENCED');expect(pages.at(-1)!.getDataSet(META)).toBeUndefined();expect(api.current.state.http.saves).toHaveLength(0)
})
it('validates output type against the original ParamType view rather than accepting arbitrary text',async()=>{
 const {v,save}=await outputs(API,true,true,true);api.current.state.http.records['Base_Interface_PublicParam']=[]
 v.updateEditingValue('F1','DataType','not_a_formal_type')
 await expect(save()).rejects.toThrow();expect(api.current.state.http.saves).toHaveLength(0)
})
it.each(['scope','dispose','provider'])('rejects a destructive save if %s changes during the metadata read',async change=>{
 const {ds,v,save}=await outputs(API,true,true,true);api.current.state.http.records['Base_Interface_PublicParam']=[]
 let entered=false,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
 api.current.state.http.beforeDefinitionRead=async table=>{if(table==='Base_DataModel'){entered=true;await gate}}
 v.updateEditingValue('F1','enname','renamed');const saving=save(),proof=expect(saving).rejects.toThrow()
 await vi.waitFor(()=>expect(entered).toBe(true))
 if(change==='scope')api.current.service.readRequestScope.mockReturnValue({token:'changed',headers:{'X-AppId':'APP'}})
 else if(change==='dispose')pages.at(-1)!.dispose()
 else{const root=ds.getView('Base_Interface_PublicParam')!;root.queryContext={...root.queryContext,providerId:'P2'}}
 release();await proof;expect(api.current.state.http.saves).toHaveLength(0)
})
it.each([API,CONFIG])('freshly rejects a remotely deleted output during binding in %s',async scenario=>{
 const {v}=await parameters(scenario)
 for(const [field,value]of Object.entries({interfaceId:'I2',outputfield:'data',interfaceName:'查询',accessPath:'/query'}))v.updateEditingValue('Q1',field,value)
 api.current.state.http.records['Base_TblField']=api.current.state.http.records['Base_TblField']!.filter(r=>r['rowid']!=='F2')
 await expect(directSave(v)).rejects.toThrow();expect(api.current.state.http.saves).toHaveLength(0)
})
it.each([API,CONFIG])('allows two distinct public parameter names to reference the same output in %s',async scenario=>{
 const {v}=await parameters(scenario);await v.addRow({paramName:'second_token',interfaceId:'I1',outputfield:'token',interfaceName:'取令牌',accessPath:'/token'})
 expect((await directSave(v)).success).toBe(true)
 expect(api.current.state.http.records['Base_Interface_PublicParam']!.filter(r=>r['providerId']==='P1'&&r['interfaceId']==='I1'&&r['outputfield']==='token')).toHaveLength(2)
})
it('verifies an unknown original binding save without rerunning reference queries or replaying writes',async()=>{
 const {v}=await parameters(API)
 for(const [field,value]of Object.entries({interfaceId:'I2',outputfield:'data',interfaceName:'查询',accessPath:'/query'}))v.updateEditingValue('Q1',field,value)
 api.current.state.http.failAfterWrite=true
 await expect(directSave(v)).rejects.toThrow('SPARK_SAVE_UNCONFIRMED');expect(v.hasUnconfirmedSave).toBe(true)
 const writes=api.current.state.http.saves.length,reads=api.current.state.http.reads.length
 expect((await directSave(v)).success).toBe(true);expect(v.hasUnconfirmedSave).toBe(false)
 expect(api.current.state.http.saves).toHaveLength(writes)
 expect(api.current.state.http.reads.slice(reads).every(r=>r.table==='Base_Interface_PublicParam')).toBe(true)
})
it('does not allow CONFIG named output views to bypass the original type option contract',async()=>{
 const {v,save}=await outputs(CONFIG,true,true,true);api.current.state.http.records['Base_Interface_PublicParam']=[]
 v.updateEditingValue('F1','DataType','not_a_formal_type')
 await expect(save()).rejects.toThrow('API_OUTPUT_OPTION_TYPE');expect(api.current.state.http.saves).toHaveLength(0)
})
it.each([API,CONFIG])('protects public parameter deletion at model level in %s',async scenario=>{
 const {v}=await parameters(scenario);v.allowDelete=true;v.commitMode='staged';await v.removeRow('Q1')
 await expect(directSave(v)).rejects.toThrow('API_PARAMETER_DELETE');expect(api.current.state.http.saves).toHaveLength(0)
})
it('registers the original formal output model even when its internal table key is aliased',async()=>{
 const original=pagedata[API]!,config=JSON.parse(original) as {tables:Record<string,unknown>;viewCascades:Array<{childTable?:string}>}
 config.tables['output_alias']=config.tables['Base_TblField'];delete config.tables['Base_TblField']
 for(const cascade of config.viewCascades)if(cascade.childTable==='Base_TblField')cascade.childTable='output_alias'
 pagedata[API]=JSON.stringify(config)
 try{
  const ds=await open(),v=ds.getView('output_alias')!.createQueryView('aliased-write')
  v.commitMode='staged';v.queryConfig={fields:['rowid','tblid','enname','DataType','IsPKey'],allPages:true};v.filterExpression={field:'tblid',operator:'eq',value:'I1'};await v.refresh()
  v.updateEditingValue('F1','IsPKey',0.5)
  await expect(directSave(v)).rejects.toThrow('API_OUTPUT_PRIMARY');expect(api.current.state.http.saves).toHaveLength(0)
 }finally{pagedata[API]=original}
})
it('does not materialize excluded API models when loading a single model scope',async()=>{
 const assembly=await loadScenarioDataSet({scenarioId:API,config:new ScenarioViewConfig(API,pagedata[API]!),modelScope:'request'})
 try{expect(Object.keys(assembly.dataSet.tables)).toEqual(['request']);expect(assembly.dataSet.getView('request')!.dataTable?.querySaveRule).toBeUndefined()}
 finally{assembly.dataSet.destroy()}
})
it('does not register API editing rules on the original metadata space',async()=>{
 await open(API,true);const page=pages.at(-1)!,metadata=await page.ensureScenarioLoaded(META)
 expect(metadata.getView('Base_DataModel')!.dataTable?.querySaveRule).toBeUndefined()
 expect(metadata.getView('Base_TblField')!.dataTable?.querySaveRule).toBeUndefined()
})
it('also protects the direct DataView save entry',async()=>{
 const {v}=await outputs();await v.editRowById('F1',{IsPKey:0.5})
 await expect(v.saveChanges()).rejects.toThrow('API_OUTPUT_PRIMARY');expect(api.current.state.http.saves).toHaveLength(0)
})
it('normalizes an edited output name through the original column rule before reference validation',async()=>{
 const {v,save}=await outputs(API,true,true,true);api.current.state.http.records['Base_Interface_PublicParam']=[]
 v.updateEditingValue('F1','enname',' renamed ')
 expect((await save()).success).toBe(true)
 expect(api.current.state.http.records['Base_TblField']!.find(r=>r['rowid']==='F1')?.['enname']).toBe('renamed')
 expect(api.current.state.http.saves.at(-1)?.changed).toMatchObject([{rowid:'F1',enname:'renamed'}])
 const reopened=await outputs();expect(reopened.v.rows.find(r=>r['rowid']==='F1')?.['enname']).toBe('renamed')
})
it('rejects a whitespace-only normalized output name before dispatch',async()=>{
 const {v,save}=await outputs(API,true,true,true);v.updateEditingValue('F1','enname','   ')
 await expect(save()).rejects.toThrow();expect(api.current.state.http.saves).toHaveLength(0)
})
it('checks normalized output name uniqueness against newly returned formal siblings',async()=>{
 const {v,save}=await outputs(API,true,true,true),rows=api.current.state.http.records['Base_TblField']!
 api.current.state.http.records['Base_Interface_PublicParam']=[]
 rows.push({...rows[0],rowid:'F3',enname:'renamed'})
 v.updateEditingValue('F1','enname',' renamed ')
 await expect(save()).rejects.toThrow('API_OUTPUT_DUPLICATE');expect(api.current.state.http.saves).toHaveLength(0)
})
