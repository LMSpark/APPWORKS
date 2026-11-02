import {afterEach,describe,expect,it} from 'vitest'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {codeService,designText,DESIGN} from '../data-code.fixture'
import {createCodeInitializationView} from '@spark-appworks/spark-lowcode-api'

const pages:PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
async function fixture(policy:Readonly<{denyAdd?:boolean;denyCode?:boolean;maskCode?:boolean;conflictingOwner?:boolean}>={}){
  const service=codeService()
  service.http.records['Base_CodeSerialPerform']=[{rowid:'OLD',CodeDesignID:'C1',NodeDesignId:null,NodeCode:'A',Code:'003'},
    {rowid:'OTHER',CodeDesignID:'C2',NodeDesignId:'SEQ',NodeCode:'A',Code:'111'}]
  if(policy.denyAdd)service.http.denyAdd.add('Base_CodeSerialPerform')
  if(policy.conflictingOwner)service.http.records['Base_CodeSerialPerform']![0]!['NodeDesignId']='OTHER'
  service.http.interceptors.response.use({onResponse:response=>{
    const body:unknown=response.data
    if(isRecord(body)&&isRecord(body['Result'])&&isRecord(body['Result']['data'])&&Array.isArray(body['Result']['data']['Items'])){
      const rows:unknown[]=body['Result']['data']['Items']
      for(const row of rows)if(isRecord(row)&&row['rowid']==='OLD'&&isRecord(row['lingma_sys_params'])){
        const permission=row['lingma_sys_params']
        if(policy.denyCode&&Array.isArray(permission['e']))permission['e']=permission['e'].filter(field=>field!=='Code')
        if(policy.maskCode){permission['m']=['Code'];row['Code']='***'}
      }
    }
    return response
  }})
  const models=await service.readModelBatch({metaNames:Object.keys(JSON.parse(designText).tables)})
  const ds=new LowcodeDataSpaceAssembler(service.runtime,service.http).assemble({config:new ScenarioViewConfig(DESIGN,designText),space:{dataSpaceId:DESIGN,name:'Code'},models,relations:[]}).dataSet
  const page=new PageRuntime({pageId:'init-resource-test',scenarioIds:[DESIGN],scenarioInputs:{[DESIGN]:{applicationId:'A',codeDesignId:'C1'}},loadScenario:async()=>ds})
  pages.push(page);await page.load()
  let target={codeId:'C1',nodeId:'SEQ',date:'',format:'001-999',increment:2,loopColumns:['1']}
  let responseOverride: Array<Record<string,unknown>>|undefined
  const client={read:async()=>responseOverride??['A','B'].map(prefix=>{
    const row=service.http.records['Base_CodeSerialPerform']!.find(row=>row['CodeDesignID']==='C1'&&row['NodeCode']===prefix)
    return {'1':prefix,min:'001',max:'999',InitVal:row?.['Code']===null||row?.['Code']===undefined?'001':String(Number(row['Code'])+2).padStart(3,'0'),rowid:row?.['rowid']??null}
  })}
  const view=createCodeInitializationView({dataSet:ds,runtime:service.runtime,client,readTarget:()=>target})
  await view.refresh()
  const save=()=>ds.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})
  return {service,ds,view,save,setTarget:(value:typeof target)=>{target=value},setResponse:(rows:Array<Record<string,unknown>>)=>{responseOverride=rows}}
}
describe('code initialization semantic view and formal persistence',()=>{
  it('edits a legacy function-selected row using its original permission and preserves its null node owner',async()=>{
    const {service,ds,view,save}=await fixture()
    expect(view.loadingError).toBeFalsy();expect(view.rows).toHaveLength(2)
    const row=view.rows.find(row=>row['prefix']==='A')!,key=view.getPkKey(row)!
    view.updateEditingValue(key,'InitVal','007')
    expect(ds.getView('Base_CodeSerialPerform')!.hasEditingChanges()).toBe(false)
    expect((await save()).success).toBe(true)
    expect(service.http.records['Base_CodeSerialPerform']![0]).toMatchObject({rowid:'OLD',Code:'005',NodeDesignId:null})
    expect(service.http.saves).toEqual([expect.objectContaining({table:'Base_CodeSerialPerform',added:[],changed:[{rowid:'OLD',Code:'005'}],deleted:[]})])
    await view.refresh();expect(view.rows.find(row=>row['prefix']==='A')?.['InitVal']).toBe('007')
    expect(service.http.records['Base_CodeSerialPerform']![1]?.['Code']).toBe('111')
  })
  it('creates only an edited combination through the original query identity and confirms the returned next value',async()=>{
    const {service,view,save}=await fixture(),row=view.rows.find(row=>row['prefix']==='B')!,key=view.getPkKey(row)!
    view.updateEditingValue(key,'InitVal','009');expect((await save()).success).toBe(true)
    const added=service.http.records['Base_CodeSerialPerform']!.filter(row=>row['NodeCode']==='B')
    expect(added).toHaveLength(1);expect(added[0]).toMatchObject({CodeDesignID:'C1',NodeDesignId:'SEQ',Code:'007'})
    expect(typeof added[0]?.['rowid']).toBe('string')
    expect(service.http.saves[0]?.added).toHaveLength(1)
    expect(view.hasEditingChanges()).toBe(false);expect(view.hasUnconfirmedSave).toBe(false)
  })
  it('cancels native candidate edits without creating formal-row drafts or issuing writes',async()=>{
    const {service,ds,view}=await fixture(),row=view.rows[0]!,key=view.getPkKey(row)!
    view.updateEditingValue(key,'InitVal','099');view.discardPendingChanges([key])
    expect(view.rows[0]?.['InitVal']).toBe('005')
    expect(ds.getView('Base_CodeSerialPerform')!.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(service.http.saves).toEqual([])
  })
  it('retains an interrupted original save, verifies without replay, then checks service readback',async()=>{
    const {service,view,save}=await fixture(),key=view.getPkKey(view.rows[0]!)!
    view.updateEditingValue(key,'InitVal','007');service.http.failAfterWrite=true
    await expect(save()).rejects.toThrow();expect(view.hasUnconfirmedSave).toBe(true)
    expect((await save()).success).toBe(true)
    expect(service.http.saves).toHaveLength(1);expect(view.hasUnconfirmedSave).toBe(false)
    expect(view.rows[0]?.['InitVal']).toBe('007')
  })
  it('does not accept a CRUD receipt when the initialization function still returns a different next value',async()=>{
    const f=await fixture(),key=f.view.getPkKey(f.view.rows[0]!)!
    f.view.updateEditingValue(key,'InitVal','007')
    f.setResponse([{'1':'A',min:'001',max:'999',InitVal:'005',rowid:'OLD'}])
    await expect(f.save()).rejects.toThrow('回读');expect(f.view.hasUnconfirmedSave).toBe(true)
    await expect(f.save()).rejects.toThrow('回读');expect(f.service.http.saves).toHaveLength(1)
  })
  it('does not accept a different persisted ID merely because its prefix and next value match',async()=>{
    const f=await fixture(),key=f.view.getPkKey(f.view.rows[0]!)!
    f.service.http.records['Base_CodeSerialPerform']!.push({rowid:'SWAPPED',CodeDesignID:'C1',NodeDesignId:null,NodeCode:'A',Code:'005'})
    f.view.updateEditingValue(key,'InitVal','007')
    f.setResponse([{'1':'A',min:'001',max:'999',InitVal:'007',rowid:'SWAPPED'}])
    await expect(f.save()).rejects.toThrow('身份')
    expect(f.view.hasUnconfirmedSave).toBe(true)
    await expect(f.save()).rejects.toThrow('身份');expect(f.service.http.saves).toHaveLength(1)
  })
  it('requires the independent formal Code readback as well as the function next-value result',async()=>{
    const f=await fixture(),key=f.view.getPkKey(f.view.rows[0]!)!
    f.service.http.interceptors.response.use({onResponse:response=>{
      const body:unknown=response.data
      if(isRecord(body)&&isRecord(body['Result'])&&Array.isArray(body['Result']['maplistedit']))f.service.http.records['Base_CodeSerialPerform']![0]!['Code']='003'
      return response
    }})
    f.view.updateEditingValue(key,'InitVal','007')
    f.setResponse([{'1':'A',min:'001',max:'999',InitVal:'007',rowid:'OLD'}])
    await expect(f.save()).rejects.toThrow('正式值')
    expect(f.view.hasUnconfirmedSave).toBe(true)
    await expect(f.save()).rejects.toThrow('正式值');expect(f.service.http.saves).toHaveLength(1)
  })
  it('rejects duplicate prefixes and missing existing IDs instead of converting them into creates',async()=>{
    const f=await fixture()
    f.setResponse([{'1':'A',min:'001',max:'999',InitVal:'001',rowid:'MISSING'}]);await f.view.refresh()
    expect(f.view.loadingError?.message).toContain('身份')
    expect(f.service.http.saves).toEqual([])
    f.setResponse([{'1':'A',min:'001',max:'999',InitVal:'001',rowid:null},{'1':'A',min:'001',max:'999',InitVal:'001',rowid:null}]);await f.view.refresh()
    expect(f.view.loadingError?.message).toContain('重复')
  })
  it('rejects a changed target before saving an old candidate patch',async()=>{
    const f=await fixture(),key=f.view.getPkKey(f.view.rows[0]!)!
    f.view.updateEditingValue(key,'InitVal','007')
    f.setTarget({codeId:'C2',nodeId:'OTHER',date:'',format:'001-999',increment:2,loopColumns:['1']})
    await expect(f.save()).rejects.toThrow('目标')
    expect(f.service.http.saves).toEqual([])
  })
  it('allows an authorized existing update when table create is denied and blocks only new combinations',async()=>{
    const f=await fixture({denyAdd:true}),existing=f.view.rows.find(row=>row['prefix']==='A')!,fresh=f.view.rows.find(row=>row['prefix']==='B')!
    expect(f.view.fieldAccess(existing,'InitVal').write).toBe('allowed')
    expect(f.view.fieldAccess(fresh,'InitVal').write).toBe('denied')
    f.view.updateEditingValue(f.view.getPkKey(fresh)!,'InitVal','007')
    await expect(f.save()).rejects.toThrow();expect(f.service.http.saves).toEqual([])
    f.view.discardPendingChanges()
    f.view.updateEditingValue(f.view.getPkKey(existing)!,'InitVal','007')
    expect((await f.save()).success).toBe(true)
    expect(f.service.http.saves[0]?.added).toEqual([])
  })
  it('uses formal field write denial and keeps raw function values out of a masked Code projection',async()=>{
    const denied=await fixture({denyCode:true}),row=denied.view.rows[0]!
    expect(denied.view.fieldAccess(row,'InitVal').write).toBe('denied')
    denied.view.updateEditingValue(denied.view.getPkKey(row)!,'InitVal','007')
    await expect(denied.save()).rejects.toThrow();expect(denied.service.http.saves).toEqual([])
    const masked=await fixture({maskCode:true}),hidden=masked.view.rows.find(row=>row['prefix']==='A')!
    expect(hidden).not.toHaveProperty('InitVal')
    expect(masked.view.fieldAccess(hidden,'InitVal').read).toBe('invisible')
    expect(masked.service.http.saves).toEqual([])
  })
  it('rejects conflicting nonempty node ownership without reassigning it',async()=>{
    const f=await fixture({conflictingOwner:true})
    expect(f.view.loadingError?.message).toContain('归属')
    expect(f.service.http.records['Base_CodeSerialPerform']![0]?.['NodeDesignId']).toBe('OTHER')
    expect(f.service.http.saves).toEqual([])
  })
})
