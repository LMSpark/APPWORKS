import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import {bindFileResourceAdapter, type FileResourceSnapshot, type FileResourceTarget, type FileResourceTransport} from '../../query/file-resource-adapter'

type Gate<T>=Readonly<{promise:Promise<T>;release(value:T):void}>
function gate<T>():Gate<T>{let release!:(value:T)=>void;const promise=new Promise<T>(resolve=>{release=resolve});return {promise,release}}

function fixture(){
  const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{Files:{resourceType:'file',resourceId:'page-files',
    columns:[{name:'fileKey',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'fileName',type:'string'},
      {name:'text',type:'string'},{name:'revision',type:'string'}],views:{default:{commitMode:'staged',queryContext:{pageId:'PAGE',fileName:'rule.json'}}}}}})
  const view=dataSet.getView('Files')!
  const store:{text:string|null;revision:string|null}={text:'baseline',revision:'v1'}
  const transport=(label:string)=>{
    const reads:Array<Gate<void>>=[],writes:Array<Gate<void>>=[]
    let holdReads=0,holdWrites=0
    const read=vi.fn(async(_target:FileResourceTarget):Promise<FileResourceSnapshot|null>=>{
      if(holdReads>0){holdReads--;const g=gate<void>();reads.push(g);await g.promise}
      return store.text===null?null:{text:store.text,revision:store.revision}
    })
    const write=vi.fn(async(input:{text:string})=>{
      if(holdWrites>0){holdWrites--;const g=gate<void>();writes.push(g);await g.promise}
      store.text=input.text;store.revision=`${label}-written`
    })
    const create=vi.fn(async(_target:unknown,_text:string,onAttempt:(attempt:{version:number;fileName:string})=>void)=>{onAttempt({version:1,fileName:'1__rule.json'})})
    const value:FileResourceTransport={read,write,isUnknown:error=>error instanceof Error&&error.message==='timeout',
      history:{list:async()=>[],preview:async()=>'',create,verify:async()=>true}}
    return {value,read,write,create,reads,writes,holdRead:()=>{holdReads++},holdWrite:()=>{holdWrites++}}
  }
  const target=(current:typeof view)=>({key:JSON.stringify([current.queryContext['pageId'],current.queryContext['fileName']]),
    fields:{pageId:current.queryContext['pageId'],fileName:current.queryContext['fileName']}})
  const bind=(io:ReturnType<typeof transport>,assertCurrent:()=>void)=>bindFileResourceAdapter(view,{resourceId:'page-files',contentField:'text',
    revisionField:'revision',target,transport:io.value,assertCurrent})
  return {dataSet,view,store,transport,bind}
}

describe('file resource in-flight binding capture',()=>{
  it('Q1 rejects a late query whose own scope expired after a same-target rebind',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B');let aExpired=false
    try{
      f.bind(a,()=>{if(aExpired)throw new Error('A scope expired')})
      a.holdRead()
      const pending=f.view.refresh()
      await vi.waitFor(()=>expect(a.reads).toHaveLength(1))
      f.bind(b,()=>undefined)
      aExpired=true
      a.reads[0]!.release()
      await pending
      expect(f.view.rows).toHaveLength(0)
      expect(b.read).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })

  it('Q2 does not dispatch a query through a transport rebound by its own guard',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B');let armed=false
    try{
      f.bind(a,()=>{if(armed){armed=false;f.bind(b,()=>undefined)}})
      armed=true
      await f.view.refresh()
      expect(b.read).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })

  it('Q3 rejects a late preview whose own scope expired after a same-target rebind',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B');let aExpired=false
    try{
      f.bind(a,()=>{if(aExpired)throw new Error('A scope expired')})
      await f.view.refresh()
      a.holdRead()
      const pending=f.view.previewSource()
      await vi.waitFor(()=>expect(a.reads).toHaveLength(1))
      f.bind(b,()=>undefined)
      aExpired=true
      a.reads[0]!.release()
      await expect(pending).rejects.toThrow()
    }finally{f.dataSet.destroy()}
  })

  it('Q4 keeps a dispatched write under its original capture when rebound and the original scope expires',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B');let aExpired=false
    try{
      f.bind(a,()=>{if(aExpired)throw new Error('A scope expired')})
      await f.view.refresh()
      await f.view.editRowById(f.view.getPkKey(f.view.rows[0]!)!,{text:'submitted'})
      a.holdWrite()
      const saving=f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default'}]})
      await vi.waitFor(()=>expect(a.writes).toHaveLength(1))
      f.bind(b,()=>undefined)
      aExpired=true
      a.writes[0]!.release()
      await expect(saving).rejects.toThrow()
      expect(b.read).not.toHaveBeenCalled()
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect(a.write).toHaveBeenCalledOnce()
      expect(b.write).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })

  it('Q5 does not dispatch a pending save through a transport rebound before write',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B')
    try{
      f.bind(a,()=>undefined)
      await f.view.refresh()
      await f.view.editRowById(f.view.getPkKey(f.view.rows[0]!)!,{text:'submitted'})
      a.holdRead()
      const saving=f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default'}]})
      await vi.waitFor(()=>expect(a.reads).toHaveLength(1))
      f.bind(b,()=>undefined)
      a.reads[0]!.release()
      await saving.catch(()=>undefined)
      expect(b.write).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })

  it('Q6 does not confirm an unknown write verification under a replacement guard after its own scope expired',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B');let aExpired=false
    try{
      f.bind(a,()=>{if(aExpired)throw new Error('A scope expired')})
      await f.view.refresh()
      await f.view.editRowById(f.view.getPkKey(f.view.rows[0]!)!,{text:'submitted'})
      a.write.mockImplementationOnce(async({text})=>{f.store.text=text;throw new Error('timeout')})
      await expect(f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default'}]})).rejects.toThrow('timeout')
      a.holdRead()
      const verifying=f.view.verifySourceWriteAttempt()
      await vi.waitFor(()=>expect(a.reads).toHaveLength(1))
      f.bind(b,()=>undefined)
      aExpired=true
      a.reads[0]!.release()
      await expect(verifying).rejects.toThrow()
      expect(f.view.hasUnconfirmedSave).toBe(true)
    }finally{f.dataSet.destroy()}
  })

  it('Q7 does not create a source version through a transport rebound before dispatch',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B')
    try{
      f.bind(a,()=>undefined)
      await f.view.refresh()
      a.holdRead()
      const creating=f.view.createSourceVersion()
      await vi.waitFor(()=>expect(a.reads).toHaveLength(1))
      f.bind(b,()=>undefined)
      a.reads[0]!.release()
      await creating.catch(()=>undefined)
      expect(b.create).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })

  it('classifies a dispatched write failure with the dispatching transport after a rebind',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B')
    try{
      f.bind(a,()=>undefined)
      await f.view.refresh()
      await f.view.editRowById(f.view.getPkKey(f.view.rows[0]!)!,{text:'submitted'})
      let fail:((error:Error)=>void)|undefined
      a.write.mockImplementationOnce(()=>new Promise<void>((_resolve,reject)=>{fail=reject}))
      const saving=f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default'}]})
      await vi.waitFor(()=>expect(fail).toBeDefined())
      f.bind({...b,value:{...b.value,isUnknown:()=>false}},()=>undefined)
      fail?.(new Error('timeout'))
      await expect(saving).rejects.toThrow('timeout')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect(a.write).toHaveBeenCalledOnce()
      expect(b.write).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })

  it('keeps a write proven by the dispatching binding confirmed when a rebind happens after dispatch',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B')
    try{
      f.bind(a,()=>undefined)
      await f.view.refresh()
      await f.view.editRowById(f.view.getPkKey(f.view.rows[0]!)!,{text:'submitted'})
      a.holdWrite()
      const input={views:[{tableName:'Files',viewId:'default'}]}
      const saving=f.dataSet.saveChanges(input)
      await vi.waitFor(()=>expect(a.writes).toHaveLength(1))
      f.bind(b,()=>undefined)
      a.writes[0]!.release()
      await expect(saving).rejects.toThrow('FILE_RESOURCE_BINDING_STALE')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect((await f.dataSet.saveChanges(input)).success).toBe(true)
      expect(a.write).toHaveBeenCalledOnce()
      expect(b.write).not.toHaveBeenCalled()
      expect(f.view.hasUnconfirmedSave).toBe(false)
      expect(f.store.text).toBe('submitted')
    }finally{f.dataSet.destroy()}
  })

  it('saves a later independent file view through the replacement binding after a rebind between views',async()=>{
    const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{Files:{resourceType:'file',resourceId:'page-files',
      columns:[{name:'fileKey',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'fileName',type:'string'},
        {name:'text',type:'string'},{name:'revision',type:'string'}],views:{default:{commitMode:'staged',queryContext:{pageId:'PAGE',fileName:'rule.json'}}}}}})
    const files=new Map([['rule.json','rule-old'],['script.js','script-old']])
    const io=(label:string)=>{
      const read=vi.fn(async(target:{fields:Record<string,unknown>})=>{const text=files.get(String(target.fields['fileName']));return text===undefined?null:{text,revision:'v1'}})
      const write=vi.fn(async(input:{target:{fields:Record<string,unknown>};text:string})=>{files.set(String(input.target.fields['fileName']),input.text)})
      return {label,read,write,value:{read,write,isUnknown:()=>false} satisfies FileResourceTransport}
    }
    const a=io('A'),b=io('B'),view=dataSet.getView('Files')!
    let armed=false
    const bind=(transport:ReturnType<typeof io>,assertCurrent:(target?:{fields:Record<string,unknown>})=>void)=>bindFileResourceAdapter(view,{resourceId:'page-files',contentField:'text',revisionField:'revision',
      target:current=>({key:JSON.stringify([current.queryContext['pageId'],current.queryContext['fileName']]),fields:{pageId:current.queryContext['pageId'],fileName:current.queryContext['fileName']}}),
      transport:transport.value,assertCurrent})
    try{
      bind(a,target=>{if(armed&&target?.fields['fileName']==='script.js'){armed=false;bind(b,()=>undefined)}})
      await view.refresh()
      const script=view.createQueryView('script')
      script.queryContext={pageId:'PAGE',fileName:'script.js'}
      await script.loadFromServer({singleFlight:false})
      await view.editRowById(view.getPkKey(view.rows[0]!)!,{text:'rule-new'})
      await script.editRowById(script.getPkKey(script.rows[0]!)!,{text:'script-new'})
      armed=true
      const scriptReadsBefore=a.read.mock.calls.filter(([target])=>target.fields['fileName']==='script.js').length
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(armed).toBe(false)
      const written=[...a.write.mock.calls,...b.write.mock.calls].map(([input])=>input.target.fields['fileName'])
      expect(written.sort()).toEqual(['rule.json','script.js'])
      expect(a.read.mock.calls.filter(([target])=>target.fields['fileName']==='script.js')).toHaveLength(scriptReadsBefore)
      expect(a.write.mock.calls.some(([input])=>input.target.fields['fileName']==='script.js')).toBe(false)
      expect(files.get('rule.json')).toBe('rule-new')
      expect(files.get('script.js')).toBe('script-new')
      expect(view.hasUnconfirmedSave||script.hasUnconfirmedSave).toBe(false)
    }finally{dataSet.destroy()}
  })

  it('applies a narrower replacement policy to existing rows and to the next save',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B')
    try{
      f.bind(a,()=>undefined)
      await f.view.refresh()
      const row=f.view.rows[0]!
      await f.view.editRowById(f.view.getPkKey(row)!,{text:'submitted'})
      bindFileResourceAdapter(f.view,{resourceId:'page-files',contentField:'text',revisionField:'revision',
        target:current=>({key:JSON.stringify([current.queryContext['pageId'],current.queryContext['fileName']]),fields:{pageId:current.queryContext['pageId'],fileName:current.queryContext['fileName']}}),
        transport:b.value,canWrite:()=>false,canDelete:()=>true})
      expect(f.view.fieldAccess(row,'text').write).toBe('denied')
      await expect(f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default'}]})).rejects.toThrow('FILE_RESOURCE_READ_ONLY')
      expect(a.write).not.toHaveBeenCalled()
      expect(b.write).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })

  it('exposes source history only for bindings whose transport provides it',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B'),{history:_history,...withoutHistory}=b.value
    try{
      bindFileResourceAdapter(f.view,{resourceId:'page-files',contentField:'text',revisionField:'revision',
        target:current=>({key:JSON.stringify([current.queryContext['pageId'],current.queryContext['fileName']]),fields:{pageId:current.queryContext['pageId'],fileName:current.queryContext['fileName']}}),
        transport:withoutHistory})
      await f.view.refresh()
      await expect(f.view.createSourceVersion()).rejects.toThrow('DATA_VIEW_SOURCE_UNSUPPORTED')
      f.bind(a,()=>undefined)
      await expect(f.view.createSourceVersion()).resolves.toMatchObject({state:'confirmed',version:1})
      expect(a.create).toHaveBeenCalledOnce()
    }finally{f.dataSet.destroy()}
  })

  it('rejects a rebind whose old guard re-entrantly installs another binding',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B'),c=f.transport('C');let armed=false
    try{
      f.bind(a,()=>{if(armed){armed=false;f.bind(c,()=>undefined)}})
      armed=true
      expect(()=>f.bind(b,()=>undefined)).toThrow('FILE_RESOURCE_BINDING_STALE')
      await f.view.refresh()
      expect(c.read).toHaveBeenCalledOnce()
      expect(b.read).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })

  it('hands transports a frozen locked target',async()=>{
    const f=fixture(),a=f.transport('A')
    try{
      f.bind(a,()=>undefined)
      await f.view.refresh()
      const target=a.read.mock.calls[0]?.[0]
      expect(Object.isFrozen(target)).toBe(true)
      expect(Object.isFrozen(target?.fields)).toBe(true)
    }finally{f.dataSet.destroy()}
  })

  it('rejects an in-flight clone query when the shared engine is rebound through its source view',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B')
    try{
      f.bind(a,()=>undefined)
      await f.view.refresh()
      const clone=f.view.createQueryView('clone')
      clone.queryContext={pageId:'PAGE',fileName:'rule.json'}
      a.holdRead()
      const pending=clone.loadFromServer({singleFlight:false})
      await vi.waitFor(()=>expect(a.reads).toHaveLength(1))
      f.bind(b,()=>undefined)
      a.reads[0]!.release()
      await expect(pending).rejects.toThrow('FILE_RESOURCE_BINDING_STALE')
      expect(clone.rows).toHaveLength(0)
      await clone.loadFromServer({singleFlight:false})
      expect(b.read).toHaveBeenCalledOnce()
    }finally{f.dataSet.destroy()}
  })

  it('P1 keeps a legal same-target follow-up query on the replacement binding',async()=>{
    const f=fixture(),a=f.transport('A'),b=f.transport('B')
    try{
      f.bind(a,()=>undefined)
      await f.view.refresh()
      f.bind(b,()=>undefined)
      await f.view.refresh()
      expect(b.read).toHaveBeenCalledOnce()
      expect(f.view.rows[0]).toMatchObject({text:'baseline'})
    }finally{f.dataSet.destroy()}
  })
})
