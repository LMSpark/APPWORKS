import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import {bindFileDirectoryQueryAdapter,bindFileResourceAdapter,createFileResourceAdapterExecutor, type FileResourceTransport} from '../../query/file-resource-adapter'

function fixture(rejectHistoryBeforeWrite=false,exposeRevision=true) {
  const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{Files:{resourceType:'file',resourceId:'page-files',
    columns:[{name:'fileKey',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'fileName',type:'string'},
      {name:'text',type:'string'},{name:'revision',type:'string'}],views:{default:{commitMode:'staged',queryContext:{pageId:'PAGE',fileName:'rule.json'}}}}}})
  const view=dataSet.getView('Files')!
  const current:{text:string|null;revision:string|null}={text:'baseline',revision:'v1'}
  const versions=new Map<number,string>()
  const read=vi.fn(async()=>current.text===null?null:{text:current.text,revision:current.revision})
  const write=vi.fn(async(_input:{text:string})=>{current.text=_input.text;current.revision='v2'})
  const remove=vi.fn(async()=>{current.text=null;current.revision=null})
  const history:NonNullable<FileResourceTransport['history']>={
    list:async target=>[...versions.keys()].map(version=>({version,fileName:`${version}__${String(target.fields['fileName'])}`,lastModified:null})),
    preview:async(_target,version)=>versions.get(Number(version))??'',
    isDefiniteRejection:error=>error instanceof Error&&error.message==='explicit history rejection',
    create:async(target,text,onAttempt)=>{const version=Math.max(0,...versions.keys())+1;onAttempt({version,fileName:`${version}__${String(target.fields['fileName'])}`})
      if(rejectHistoryBeforeWrite)throw new Error('explicit history rejection')
      versions.set(version,text);throw new Error('timeout')},
    verify:async(_target,attempt,expectedText)=>versions.get(Number(attempt.version))===expectedText,
  }
  const transport:FileResourceTransport={read,write,remove,history,isUnknown:error=>error instanceof Error&&error.message==='timeout'}
  const bind=(targetView:typeof view)=>bindFileResourceAdapter(targetView,{resourceId:'page-files',contentField:'text',...(exposeRevision?{revisionField:'revision'}:{}),
    target:target=>({key:JSON.stringify([target.queryContext['pageId'],target.queryContext['fileName']]),fields:{pageId:target.queryContext['pageId'],fileName:target.queryContext['fileName']}}),transport})
  bind(view)
  return {dataSet,view,current,read,write,remove,bind,versions,history,transport}
}

describe('DataView file resource adapter',()=>{

  it('keeps filter ownership defaults private when they are outside the new file output',async()=>{
    const f=fixture();f.current.text=null
    try{
      f.view.filterExpression={field:'pageId',operator:'eq',value:'PAGE'}
      await f.view.loadFromServer({fields:['fileKey','text']})
      const added=await f.view.addRow({text:'filtered new file'})
      expect(added).not.toHaveProperty('pageId')
      expect(f.view.rows[0]).not.toHaveProperty('pageId')
      f.view.discardPendingChanges()
      expect(f.view.rows).toHaveLength(0);expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.write).not.toHaveBeenCalled()
      await f.view.addRow({text:'filtered new file'})
      expect(f.view.rows[0]).not.toHaveProperty('pageId')
      const saved=await f.dataSet.saveChanges();expect(saved.success).toBe(true)
      expect(f.current.text).toBe('filtered new file')
    }finally{f.dataSet.destroy()}
  })


  it('does not inject unprojected target fields into a valid new file draft',async()=>{
    const f=fixture();f.current.text=null
    try{
      await f.view.loadFromServer({fields:['fileKey','text']})
      const added=await f.view.addRow({text:'new file'})
      expect(added).not.toHaveProperty('pageId');expect(added).not.toHaveProperty('fileName')
      expect(f.view.rows[0]).not.toHaveProperty('pageId')
      expect(f.view.fieldAccess(f.view.rows[0]!,'pageId').read).toBe('invisible')
      const saved=await f.dataSet.saveChanges();expect(saved.success).toBe(true)
      expect(f.current.text).toBe('new file');expect(f.write).toHaveBeenCalledOnce()
    }finally{f.dataSet.destroy()}
  })

  it('uses the owner output scope for missing-file field visibility before staging',async()=>{
    const f=fixture();f.current.text=null
    try{
      await f.view.loadFromServer({fields:['fileKey','text']})
      expect(f.view.newRowFieldAccess('pageId')).toMatchObject({read:'invisible',write:'denied',component:'hidden'})
      expect(f.view.newRowFieldAccess('text')).toMatchObject({read:'visible',write:'allowed'})
    }finally{f.dataSet.destroy()}
  })


  it.each(['page','projection'] as const)('rejects new file drafts outside the query create capability (%s)',async mode=>{
    const f=fixture()
    try{
      if(mode==='projection')f.current.text=null
      f.view.queryConfig={pagination:'paged'}
      await f.view.loadFromServer(mode==='page'?{page:2,pageSize:1}:{fields:['fileKey']})
      if(mode==='projection')expect(f.view.newRowFieldAccess('text').write).toBe('denied')
      await expect(f.view.addRow({})).rejects.toThrow('FILE_RESOURCE_CREATE_UNAVAILABLE')
      expect(f.view.rows).toHaveLength(0)
      expect(f.view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(f.write).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })


  it.each([
    {expose:false,from:'v1',to:'v2'}, {expose:true,from:null,to:''},
  ].flatMap(version=>(['update','delete'] as const).map(operation=>({...version,operation}))))('keeps the source revision independent of its display column (%j)',async version=>{
      const operation=version.operation
      const f=fixture(false,version.expose);f.current.revision=version.from
      try{
        await f.view.refresh()
        const id=f.view.getPkKey(f.view.rows[0]!)!
        if(operation==='update')await f.view.editRowById(id,{text:'edited'})
        else await f.view.removeRow(id)
        f.current.revision=version.to
        await expect(f.dataSet.saveChanges()).rejects.toThrow('FILE_RESOURCE_CONFLICT')
        expect(f.write).not.toHaveBeenCalled();expect(f.remove).not.toHaveBeenCalled()
      }finally{f.dataSet.destroy()}
  })


  it.each(['create','update'] as const)('does not publish unprojected snapshot fields through a %s receipt',async operation=>{
    const f=fixture()
    f.dataSet.getTable('Files')!.addColumns([{name:'localDirty',type:'boolean'}])
    f.read.mockImplementation(async()=>f.current.text===null?null:{text:f.current.text,revision:f.current.revision,fields:{localDirty:false}})
    if(operation==='create')f.current.text=null
    try{
      await f.view.loadFromServer({fields:['fileKey','pageId','fileName','text','revision']})
      if(operation==='create')await f.view.addRow({pageId:'PAGE',fileName:'rule.json',text:'saved'})
      else await f.view.editRowById(f.view.getPkKey(f.view.rows[0]!)!,{text:'saved'})
      const saved=await f.dataSet.saveChanges()
      expect(saved.success).toBe(true)
      expect(f.view.rows[0]).not.toHaveProperty('localDirty')
      expect(f.view.fieldAccess(f.view.rows[0]!,'localDirty').read).toBe('invisible')
      expect(f.write).toHaveBeenCalledOnce()
    }finally{f.dataSet.destroy()}
  })

  it('deletes a key-only projection using the private source baseline',async()=>{
    const f=fixture()
    try{
      await f.view.loadFromServer({fields:['fileKey']})
      await f.view.removeRow(f.view.getPkKey(f.view.rows[0]!)!)
      const saved=await f.dataSet.saveChanges()
      expect(saved.success).toBe(true);expect(f.current.text).toBeNull()
      expect(f.remove).toHaveBeenCalledOnce();expect(f.view.rows).toHaveLength(0)
    }finally{f.dataSet.destroy()}
  })


  it('keeps the original file output scope after accepting a write receipt',async()=>{
    const f=fixture()
    try{
      await f.view.loadFromServer({fields:['fileKey','text']})
      await f.view.editRowById(f.view.getPkKey(f.view.rows[0]!)!,{text:'edited'})
      const saved=await f.dataSet.saveChanges()
      expect(saved.success).toBe(true);expect(f.current.text).toBe('edited')
      expect(f.view.fieldAccess(f.view.rows[0]!,'revision')).toMatchObject({read:'invisible',write:'denied'})
      expect(f.write).toHaveBeenCalledOnce()
    }finally{f.dataSet.destroy()}
  })

  it('captures the file filter before awaiting the source read',async()=>{
    const f=fixture()
    let release:(snapshot:{text:string;revision:string})=>void=()=>{throw new Error('not started')}
    f.read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
    const filter={field:'text',operator:'eq' as const,value:'baseline'}
    try{
      const pending=f.view.loadFromServer({filter})
      await vi.waitFor(()=>expect(f.read).toHaveBeenCalledOnce())
      filter.value='different';release({text:'baseline',revision:'v1'})
      await pending
      expect(f.view.rows).toHaveLength(1)
      expect(f.view.rows[0]?.['text']).toBe('baseline')
    }finally{f.dataSet.destroy()}
  })

  it('rejects unsupported directory fields and tree modes before listing',async()=>{
    const f=fixture(),view=f.dataSet.getTable('Files')!.getOrCreateView('directory-invalid')
    const list=vi.fn(async()=>['rule.json'])
    try{
      bindFileDirectoryQueryAdapter(view,{resourceId:'page-files',target:()=>({key:'PAGE',fields:{pageId:'PAGE'}}),list})
      await view.loadFromServer({fields:['text']}).catch(()=>undefined)
      expect(view.loadingError).toBeInstanceOf(Error);expect(list).not.toHaveBeenCalled()
      view.treeMode='nested'
      await view.loadFromServer().catch(()=>undefined)
      expect(view.loadingError).toBeInstanceOf(Error);expect(list).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })


  it.each(['page', 'filter'] as const)('does not treat an existing file hidden by %s as missing',async mode=>{
    const f=fixture()
    try{
      f.view.queryConfig={pagination:'paged'}
      const options=mode==='page'?{page:2,pageSize:1}:{filter:{field:'text',operator:'eq' as const,value:'absent'}}
      await f.view.loadFromServer(options)
      expect(f.view.rows).toHaveLength(0)
      expect(f.view.total).toBe(mode==='page'?1:0)
      expect(f.view.addActionState()).toBe('disabled')
      expect(f.read).toHaveBeenCalledOnce();expect(f.write).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })

  it('does not widen a key-only file projection into readable or writable content',async()=>{
    const f=fixture()
    try{
      await f.view.loadFromServer({fields:['fileKey']})
      const row=f.view.rows[0]!
      expect(row).not.toHaveProperty('text')
      expect(f.view.fieldAccess(row,'text')).toMatchObject({read:'invisible',write:'denied'})
    }finally{f.dataSet.destroy()}
  })

  it.each([true,false])('rejects unsupported file queries before transport even when missing=%s',async missing=>{
    const f=fixture();if(missing)f.current.text=null
    try{
      await f.view.loadFromServer({distinct:true}).catch(()=>undefined)
      expect(f.view.loadingError).toBeInstanceOf(Error)
      expect(f.read).not.toHaveBeenCalled()
    }finally{f.dataSet.destroy()}
  })

  it('keeps explicit directory pagination and the full default listing separate',async()=>{
    const f=fixture(),view=f.dataSet.getTable('Files')!.getOrCreateView('directory-page')
    const names=Array.from({length:31},(_,i)=>`file-${i}.json`),list=vi.fn(async()=>names)
    const options={resourceId:'page-files',target:()=>({key:'PAGE',fields:{pageId:'PAGE'}}),list}
    try{
      bindFileDirectoryQueryAdapter(view,options)
      await view.refresh();expect(view.rows).toHaveLength(31)
      view.queryConfig={pagination:'paged'}
      await view.loadFromServer({page:2,pageSize:1})
      expect(view.rows.map(row=>row['fileName'])).toEqual(['file-1.json'])
      expect(view.total).toBe(31)
      bindFileDirectoryQueryAdapter(view,options)
      expect(view.queryConfig.pagination).toBe('paged')
    }finally{f.dataSet.destroy()}
  })

  it('does not downgrade a concurrent confirmed write with a stale recovery read',async()=>{
    const f=fixture()
    try{
      await f.view.refresh()
      const peer=f.view.createQueryView('peer');peer.queryContext={pageId:'PAGE',fileName:'rule.json'};await peer.refresh()
      await f.view.editRowById(f.view.getPkKey(f.view.rows[0]!)!,{text:'submitted'})
      f.write.mockImplementationOnce(async({text})=>{f.current.text=text;f.current.revision='v2';throw new Error('timeout')})
      const input={views:[{tableName:'Files',viewId:'default'}]}
      await expect(f.dataSet.saveChanges(input)).rejects.toThrow('timeout')
      let release:((value:{text:string;revision:string})=>void)|undefined
      f.read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
      const recovery=f.dataSet.saveChanges(input)
      await vi.waitFor(()=>expect(release).toBeDefined())
      expect((await peer.verifySourceWriteAttempt()).state).toBe('confirmed')
      release?.({text:'baseline',revision:'v1'})
      await expect(recovery).rejects.toThrow('FILE_RESOURCE_VERIFY_STALE')
      expect(f.view.abandonUnconfirmedSave()).toBe(false)
      expect((await f.dataSet.saveChanges(input)).success).toBe(true)
      expect(f.write).toHaveBeenCalledOnce()
    }finally{f.dataSet.destroy()}
  })

  it('does not let an old cleared capture abandon another view newer unknown write',async()=>{
    const f=fixture()
    try{
      await f.view.refresh()
      const peer=f.view.createQueryView('peer');peer.queryContext={pageId:'PAGE',fileName:'rule.json'};await peer.refresh()
      f.write.mockRejectedValue(new Error('timeout'))
      await f.view.editRowById(f.view.getPkKey(f.view.rows[0]!)!,{text:'A'})
      await expect(f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default'}]})).rejects.toThrow('timeout')
      expect((await f.view.verifySourceWriteAttempt()).state).toBe('not-applied')
      f.view.acknowledgeSourceWriteAttempt()
      await peer.editRowById(peer.getPkKey(peer.rows[0]!)!,{text:'B'})
      await expect(f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'peer'}]})).rejects.toThrow('timeout')
      expect(()=>f.view.abandonUnconfirmedSave()).toThrow('FILE_RESOURCE_SAVE_OWNER')
      expect(peer.hasUnconfirmedSave).toBe(true)
      expect(peer.abandonUnconfirmedSave()).toBe(true)
    }finally{f.dataSet.destroy()}
  })

  it.each(['create','update','delete'] as const)('retains confirmed %s until DataView acceptance across a late scope expiry',async operation=>{
    const f=fixture()
    let expired=false,armed=true
    bindFileResourceAdapter(f.view,{resourceId:'page-files',contentField:'text',revisionField:'revision',
      target:()=>({key:JSON.stringify(['PAGE','rule.json']),fields:{pageId:'PAGE',fileName:'rule.json'}}),transport:f.transport,
      assertCurrent:()=>{
        if(expired)throw new Error('late file scope expiry')
        if(armed&&f.read.mock.calls.length>=3&&f.write.mock.calls.length+f.remove.mock.calls.length>0){armed=false;queueMicrotask(()=>{expired=true})}
      }})
    try{
      if(operation==='create')f.current.text=null
      await f.view.refresh()
      const peer=f.view.createQueryView('peer')
      peer.queryContext={pageId:'PAGE',fileName:'rule.json'}
      await peer.refresh()
      if(operation==='create')await f.view.addRow({pageId:'PAGE',fileName:'rule.json',text:'submitted'})
      else {
        const id=f.view.getPkKey(f.view.rows[0]!)!
        if(operation==='delete')await f.view.removeRow(id)
        else await f.view.editRowById(id,{text:'submitted'})
      }
      await expect(f.dataSet.saveChanges()).rejects.toThrow('late file scope expiry')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expired=false
      if(operation==='create'){
        f.current.text=null
        expect((await f.view.verifySourceWriteAttempt()).state).toBe('unknown')
        expect(f.view.hasUnconfirmedSave).toBe(true)
        f.current.text='submitted'
      }
      expect(f.view.abandonUnconfirmedSave()).toBe(false)
      f.view.acknowledgeSourceWriteAttempt()
      peer.acknowledgeSourceWriteAttempt()
      expect(f.view.hasUnconfirmedSave).toBe(true)
      if(operation==='create')await peer.addRow({pageId:'PAGE',fileName:'rule.json',text:'submitted'})
      else if(operation==='delete')await peer.removeRow(peer.getPkKey(peer.rows[0]!)!)
      else await peer.editRowById(peer.getPkKey(peer.rows[0]!)!,{text:'submitted'})
      await expect(f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'peer'}]})).rejects.toThrow('FILE_RESOURCE_SAVE_OWNER')
      expect(peer.hasUnconfirmedSave).toBe(false)
      expect(f.view.hasUnconfirmedSave).toBe(true)
      let release:((value:{text:string;revision:string|null})=>void)|undefined
      const stale=operation==='update'?(f.read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve})),peer.verifySourceWriteAttempt()):undefined
      expect((await f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default'}]})).success).toBe(true)
      if(stale){release?.({text:'submitted',revision:'v2'});await expect(stale).rejects.toThrow('FILE_RESOURCE_VERIFY_STALE')}
      expect(f.write).toHaveBeenCalledTimes(operation==='delete'?0:1)
      expect(f.remove).toHaveBeenCalledTimes(operation==='delete'?1:0)
      expect(f.view.hasUnconfirmedSave).toBe(false)
    }finally{f.dataSet.destroy()}
  })

  it('rejects rebinding a file DataView to another target of the same resource',()=>{
    const f=fixture()
    try{
      f.view.queryContext={pageId:'OTHER',fileName:'script.js'}
      expect(()=>f.bind(f.view)).toThrow('FILE_RESOURCE_IDENTITY')
    }finally{f.dataSet.destroy()}
  })

  it('does not apply a query result after its bound file target changes in flight',async()=>{
    let targetPage='PAGE',releaseRead:((value:{text:string;revision:string})=>void)|undefined
    const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{Files:{resourceType:'file',resourceId:'page-files',
      columns:[{name:'fileKey',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'fileName',type:'string'},
        {name:'text',type:'string'},{name:'revision',type:'string'}],views:{default:{commitMode:'staged',queryContext:{pageId:'PAGE',fileName:'rule.json'}}}}}})
    const view=dataSet.getView('Files')!,read=vi.fn(()=>new Promise<{text:string;revision:string}>(resolve=>{releaseRead=resolve}))
    const write=vi.fn(async()=>undefined),remove=vi.fn(async()=>undefined)
    try{
      bindFileResourceAdapter(view,{resourceId:'page-files',contentField:'text',revisionField:'revision',
        target:()=>({key:targetPage,fields:{pageId:targetPage,fileName:'rule.json'}}),transport:{read,write,remove,isUnknown:()=>false}})
      const pending=view.refresh()
      await vi.waitFor(()=>expect(releaseRead).toBeDefined())
      targetPage='OTHER'
      releaseRead?.({text:'stale target contents',revision:'old'})
      await pending
      expect(view.rows).toHaveLength(0)
      expect(write).not.toHaveBeenCalled()
      expect(remove).not.toHaveBeenCalled()
    }finally{dataSet.destroy()}
  })

  it('routes a configured query clone through its own target instead of the empty declaration view',async()=>{
    const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{Files:{resourceType:'file',resourceId:'page-files',
      columns:[{name:'fileKey',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'fileName',type:'string'},
        {name:'text',type:'string'},{name:'revision',type:'string'}],views:{default:{commitMode:'staged'}}}}})
    const declaration=dataSet.getView('Files')!,files=new Map([['["PAGE","rule.json"]','baseline']]),written:Array<{key:string;text:string}> = []
    const read=vi.fn(async(target:{key:string;fields:Record<string,unknown>})=>{
      const text=files.get(target.key);return text===undefined?null:{text,revision:'v1'}
    })
    const write=vi.fn(async(input:{target:{key:string};text:string})=>{written.push({key:input.target.key,text:input.text});files.set(input.target.key,input.text)})
    const transport:FileResourceTransport={read,write,isUnknown:()=>false}
    bindFileResourceAdapter(declaration,{resourceId:'page-files',contentField:'text',revisionField:'revision',
      target:view=>{
        const pageId=view.queryContext['pageId'],fileName=view.queryContext['fileName']
        return typeof pageId==='string'&&pageId&&typeof fileName==='string'&&fileName
          ?{key:JSON.stringify([pageId,fileName]),fields:{pageId,fileName}}
          :{key:'declaration-template',fields:{template:true}}
      },transport})
    try{
      const query=declaration.createQueryView('page-PAGE-rule')
      query.queryContext={pageId:'PAGE',fileName:'rule.json'}
      await query.refresh()
      await query.editRowById(query.getPkKey(query.rows[0]!)!,{text:'edited'})
      await dataSet.saveChanges({views:[{tableName:'Files',viewId:query.viewId}]})
      expect(written).toEqual([{key:JSON.stringify(['PAGE','rule.json']),text:'edited'}])
    }finally{dataSet.destroy()}
  })

  it('locks each queried clone to its first complete target while allowing setup before its first query',async()=>{
    const f=fixture()
    try{
      const query=f.view.createQueryView('clone')
      query.queryContext={pageId:'PAGE',fileName:'rule.json'}
      await query.loadFromServer({singleFlight:false})
      query.queryContext={pageId:'OTHER',fileName:'script.js'}
      await expect(query.loadFromServer({singleFlight:false})).rejects.toThrow('FILE_RESOURCE_IDENTITY')
      expect(f.read).not.toHaveBeenCalledWith(expect.objectContaining({key:JSON.stringify(['OTHER','script.js'])}))
    }finally{f.dataSet.destroy()}
  })

  it('does not lock an unqueried clone while another same-source view enumerates peers',async()=>{
    const f=fixture()
    try{
      await f.view.refresh()
      const clone=f.view.createQueryView('unqueried-clone')
      await expect(f.view.createSourceVersion()).rejects.toThrow('timeout')
      clone.queryContext={pageId:'OTHER',fileName:'script.js'}
      await clone.loadFromServer({singleFlight:false})
      expect(f.read).toHaveBeenCalledWith(expect.objectContaining({key:JSON.stringify(['OTHER','script.js'])}))
    }finally{f.dataSet.destroy()}
  })

  it('retains an immutable target signature when a target object is mutated in place',async()=>{
    const f=fixture(),fields:{pageId:string;fileName:string}={pageId:'PAGE',fileName:'rule.json'}
    try{
      bindFileResourceAdapter(f.view,{resourceId:'page-files',contentField:'text',revisionField:'revision',
        target:()=>({key:JSON.stringify([fields.pageId,fields.fileName]),fields}),transport:f.transport})
      await f.view.refresh()
      fields.pageId='OTHER'
      await expect(f.view.loadFromServer({singleFlight:false})).rejects.toThrow('FILE_RESOURCE_IDENTITY')
    }finally{f.dataSet.destroy()}
  })

  it('keeps a composite published pointer read-only while reading its exact target',async()=>{
    const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{Files:{resourceType:'file',resourceId:'page-files',
      columns:[{name:'fileKey',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'fileName',type:'string'},
        {name:'versionId',type:'string'},{name:'text',type:'string'},{name:'revision',type:'string'}],views:{default:{commitMode:'staged',
          queryContext:{pageId:'PAGE',fileName:'rule.json',versionId:'rule=2;script=1;style=3'}}}}}})
    const view=dataSet.getView('Files')!,pointer='rule=2;script=1;style=3',read=vi.fn(async(target:{fields:Record<string,unknown>})=>
      ({text:`snapshot-${String(target.fields['versionId'])}`,revision:'snapshot'}))
    const options={resourceId:'page-files',contentField:'text',revisionField:'revision',
      target:(current:typeof view)=>({key:JSON.stringify([current.queryContext['pageId'],current.queryContext['fileName'],current.queryContext['versionId']]),
        fields:{pageId:current.queryContext['pageId'],fileName:current.queryContext['fileName'],versionId:current.queryContext['versionId']}}),
      transport:{read,write:vi.fn(async()=>undefined),isUnknown:()=>false},
      canWrite:(target:{fields:Record<string,unknown>})=>target.fields['versionId']===''}
    try{
      bindFileResourceAdapter(view,options)
      await view.refresh()
      expect(read).toHaveBeenCalledWith(expect.objectContaining({fields:expect.objectContaining({versionId:pointer})}))
      expect(view.rows[0]?.['text']).toBe(`snapshot-${pointer}`)
      expect(view.fieldAccess(view.rows[0]!, 'text').write).toBe('denied')
      expect(view.editActionState(view.rows[0]!)).toBe('disabled')
    }finally{dataSet.destroy()}
  })

  it('allows a same-target rebind to refresh its transport and current-scope assertion',async()=>{
    const f=fixture(),newRead=vi.fn(async()=>({text:'from replacement transport',revision:'v3'})),assertCurrent=vi.fn()
    try{
      bindFileResourceAdapter(f.view,{resourceId:'page-files',contentField:'text',revisionField:'revision',
        target:target=>({key:JSON.stringify([target.queryContext['pageId'],target.queryContext['fileName']]),fields:{pageId:target.queryContext['pageId'],fileName:target.queryContext['fileName']}}),
        transport:{...f.transport,read:newRead},assertCurrent})
      await f.view.refresh()
      expect(newRead).toHaveBeenCalledOnce()
      expect(assertCurrent).toHaveBeenCalled()
      expect(f.view.rows[0]).toMatchObject({text:'from replacement transport',revision:'v3'})
    }finally{f.dataSet.destroy()}
  })

  it('keeps a directory query bound to its original resource target on rebind',()=>{
    const f=fixture(),view=f.dataSet.getTable('Files')!.getOrCreateView('directory-PAGE')
    const options={resourceId:'page-files',target:()=>({key:'APP/PAGE',fields:{appId:'APP',pageId:'PAGE'}}),list:async()=>['rule.json']}
    try{
      bindFileDirectoryQueryAdapter(view,options)
      expect(()=>bindFileDirectoryQueryAdapter(view,{...options,target:()=>({key:'OTHER/PAGE',fields:{appId:'OTHER',pageId:'PAGE'}})}))
        .toThrow('FILE_DIRECTORY_VIEW_IDENTITY')
    }finally{f.dataSet.destroy()}
  })

  it('does not apply a directory result after its bound target changes while listing',async()=>{
    const f=fixture(),view=f.dataSet.getTable('Files')!.getOrCreateView('directory-PAGE')
    let targetPage='PAGE',releaseList:((names:readonly string[])=>void)|undefined
    const options={resourceId:'page-files',target:()=>({key:`APP/${targetPage}`,fields:{appId:'APP',pageId:targetPage}}),
      list:vi.fn(()=>new Promise<readonly string[]>(resolve=>{releaseList=resolve}))}
    try{
      bindFileDirectoryQueryAdapter(view,options)
      const pending=view.refresh()
      await vi.waitFor(()=>expect(releaseList).toBeDefined())
      targetPage='OTHER'
      releaseList?.(['stale-extra.txt'])
      await pending
      expect(view.rows).toHaveLength(0)
    }finally{f.dataSet.destroy()}
  })

  it('loads the bound resource into DataView and saves one changed text through its DataSet receipt',async()=>{
    const f=fixture()
    try {
      await f.view.refresh()
      expect(f.view.rows[0]).toMatchObject({pageId:'PAGE',fileName:'rule.json',text:'baseline',revision:'v1'})
      const id=f.view.getPkKey(f.view.rows[0]!)!
      await f.view.editRowById(id,{text:'updated'})
      const result=await f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default',ids:[id]}]})
      expect(result.success).toBe(true)
      expect(f.current.text).toBe('updated')
      expect(f.view.rows[0]).toMatchObject({text:'updated',revision:'v2'})
    } finally {f.dataSet.destroy()}
  })

  it('creates a missing file as a staged formal DataView row and accepts its DataSet receipt',async()=>{
    const f=fixture()
    try {
      f.current.text=null
      await f.view.refresh()
      expect(f.view.rows).toHaveLength(0)
      const created=await f.view.addRow({pageId:'PAGE',fileName:'rule.json',text:'new file'})
      expect(created).not.toHaveProperty('success')
      const id=f.view.getPkKey(created as Record<string,unknown>)
      expect(id).toBe(JSON.stringify(['PAGE','rule.json']))
      const receipt=await f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default',ids:[id!]}]})
      expect(receipt.success).toBe(true)
      expect(f.current.text).toBe('new file')
      expect(f.view.rows).toEqual([expect.objectContaining({pageId:'PAGE',fileName:'rule.json',text:'new file',revision:'v2'})])
    } finally {f.dataSet.destroy()}
  })

  it('verifies an unknown accepted file creation before accepting the same DataView receipt',async()=>{
    const f=fixture()
    try {
      f.current.text=null
      await f.view.refresh()
      const created=await f.view.addRow({pageId:'PAGE',fileName:'rule.json',text:'created once'}) as Record<string,unknown>
      const id=f.view.getPkKey(created)!
      f.write.mockImplementationOnce(async({text})=>{f.current.text=text;f.current.revision='v2';throw new Error('timeout')})
      const input={views:[{tableName:'Files',viewId:'default',ids:[id]}]}
      await expect(f.dataSet.saveChanges(input)).rejects.toThrow('timeout')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      await expect(f.view.verifySourceWriteAttempt()).resolves.toEqual({state:'confirmed',text:'created once',message:null})
      expect((await f.dataSet.saveChanges(input)).success).toBe(true)
      expect(f.write).toHaveBeenCalledOnce()
      expect(f.view.rows).toEqual([expect.objectContaining({text:'created once',revision:'v2'})])
    } finally {f.dataSet.destroy()}
  })

  it('deletes a file through its bound DataView and confirms the empty source readback',async()=>{
    const f=fixture()
    try {
      await f.view.refresh()
      const id=f.view.getPkKey(f.view.rows[0]!)!
      expect(await f.view.removeRow(id)).toBe(true)
      const result=await f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default',ids:[id]}]})
      expect(result.success).toBe(true)
      expect(f.remove).toHaveBeenCalledOnce()
      expect(f.current.text).toBeNull()
      expect(f.view.rows).toHaveLength(0)
    } finally {f.dataSet.destroy()}
  })

  it('keeps an accepted removal attempt when receipt readback fails and verifies it without removing twice',async()=>{
    const f=fixture()
    try{
      await f.view.refresh();const id=f.view.getPkKey(f.view.rows[0]!)!
      const originalRead=f.read.getMockImplementation()!
      let failed=false
      f.read.mockImplementation(async()=>{
        const snapshot=await originalRead()
        if(!failed&&snapshot===null){failed=true;const error=new Error('delete receipt unavailable') as Error & {response:{status:number}};error.response={status:503};throw error}
        return snapshot
      })
      await f.view.removeRow(id)
      const input={views:[{tableName:'Files',viewId:'default',ids:[id]}]}
      await expect(f.dataSet.saveChanges(input)).rejects.toThrow('delete receipt unavailable')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect((await f.dataSet.saveChanges(input)).success).toBe(true)
      expect(f.remove).toHaveBeenCalledOnce()
      expect(f.view.hasUnconfirmedSave).toBe(false)
    }finally{f.dataSet.destroy()}
  })

  it('verifies an unknown accepted file deletion before accepting the same DataView receipt',async()=>{
    const f=fixture()
    try {
      await f.view.refresh()
      const id=f.view.getPkKey(f.view.rows[0]!)!
      await f.view.removeRow(id)
      f.remove.mockImplementationOnce(async()=>{f.current.text=null;f.current.revision=null;throw new Error('timeout')})
      const input={views:[{tableName:'Files',viewId:'default',ids:[id]}]}
      await expect(f.dataSet.saveChanges(input)).rejects.toThrow('timeout')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      await expect(f.view.verifySourceWriteAttempt()).resolves.toEqual({state:'confirmed',text:null,message:null})
      expect((await f.dataSet.saveChanges(input)).success).toBe(true)
      expect(f.remove).toHaveBeenCalledOnce()
      expect(f.view.rows).toHaveLength(0)
    } finally {f.dataSet.destroy()}
  })

  it('does not overwrite a remote change since the DataView query baseline',async()=>{
    const f=fixture()
    try {
      await f.view.refresh();const id=f.view.getPkKey(f.view.rows[0]!)!
      await f.view.editRowById(id,{text:'local'})
      f.current.text='remote'
      await expect(f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default',ids:[id]}]})).rejects.toThrow('FILE_RESOURCE_CONFLICT')
      expect(f.current.text).toBe('remote')
    } finally {f.dataSet.destroy()}
  })

  it('verifies an unknown accepted write before returning a DataView save receipt',async()=>{
    const f=fixture()
    try {
      await f.view.refresh();const id=f.view.getPkKey(f.view.rows[0]!)!
      await f.view.editRowById(id,{text:'accepted'})
      f.write.mockImplementationOnce(async({text})=>{f.current.text=text;throw new Error('timeout')})
      const input={views:[{tableName:'Files',viewId:'default',ids:[id]}]}
      await expect(f.dataSet.saveChanges(input)).rejects.toThrow('timeout')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect((await f.dataSet.saveChanges(input)).success).toBe(true)
      expect(f.write).toHaveBeenCalledOnce()
      expect(f.view.hasUnconfirmedSave).toBe(false)
    } finally {f.dataSet.destroy()}
  })

  it('keeps an accepted write pending when receipt readback fails and verifies it without rewriting',async()=>{
    const f=fixture()
    try{
      await f.view.refresh();const id=f.view.getPkKey(f.view.rows[0]!)!
      await f.view.editRowById(id,{text:'accepted-with-readback-error'})
      const originalRead=f.read.getMockImplementation()!
      let failReceiptRead=true
      f.read.mockImplementation(async()=>{
        if(failReceiptRead&&f.current.text==='accepted-with-readback-error'){
          failReceiptRead=false
          const error=new Error('receipt read unavailable') as Error & {response:{status:number}}
          error.response={status:503}
          throw error
        }
        return originalRead()
      })
      const input={views:[{tableName:'Files',viewId:'default',ids:[id]}]}
      await expect(f.dataSet.saveChanges(input)).rejects.toThrow('receipt read unavailable')
      expect(f.view.hasUnconfirmedSave).toBe(true)
      expect((await f.dataSet.saveChanges(input)).success).toBe(true)
      expect(f.write).toHaveBeenCalledOnce()
      expect(f.view.hasUnconfirmedSave).toBe(false)
    }finally{f.dataSet.destroy()}
  })

  it('serializes same-target writes from two query clones in one DataSet',async()=>{
    const f=fixture();let finish:(()=>void)|undefined
    const waiting=new Promise<void>(resolve=>{finish=resolve})
    try{
      await f.view.refresh()
      const clone=f.view.createQueryView('same-target-clone')
      clone.queryContext={...f.view.queryContext}
      await clone.loadFromServer({singleFlight:false})
      const firstId=f.view.getPkKey(f.view.rows[0]!)!,secondId=clone.getPkKey(clone.rows[0]!)!
      await f.view.editRowById(firstId,{text:'first'})
      await clone.editRowById(secondId,{text:'second'})
      f.write.mockImplementationOnce(async({text})=>{await waiting;f.current.text=text;f.current.revision='v2'})
      const first=f.dataSet.saveChanges({views:[{tableName:'Files',viewId:f.view.viewId,ids:[firstId]}]})
      await vi.waitFor(()=>expect(f.write).toHaveBeenCalledOnce())
      await expect(f.dataSet.saveChanges({views:[{tableName:'Files',viewId:clone.viewId,ids:[secondId]}]})).rejects.toThrow('FILE_RESOURCE_SAVE_PENDING')
      finish?.()
      expect((await first).success).toBe(true)
      expect(f.write).toHaveBeenCalledOnce()
      expect(f.current.text).toBe('first')
    }finally{finish?.();f.dataSet.destroy()}
  })

  it('accepts an earlier file receipt when a later file in the same DataSet is rejected',async()=>{
    const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{Files:{resourceType:'file',resourceId:'page-files',columns:[
      {name:'fileKey',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'fileName',type:'string'},
      {name:'text',type:'string'},{name:'revision',type:'string'}],views:{default:{commitMode:'staged',queryContext:{pageId:'PAGE',fileName:'rule.json'}}}}}})
    const files=new Map([['rule.json','rule-old'],['script.js','script-old']]),writes:string[]=[]
    let rejectScript=true
    const transport:FileResourceTransport={
      read:async target=>{const text=files.get(String(target.fields['fileName']));return text===undefined?null:{text,revision:'v1'}},
      write:async({target,text})=>{const fileName=String(target.fields['fileName']);writes.push(fileName)
        if(fileName==='script.js'&&rejectScript){rejectScript=false;throw new Error('explicit source rejection')}
        files.set(fileName,text)},
      isUnknown:()=>false,
    }
    const executor=createFileResourceAdapterExecutor({resourceId:'page-files',contentField:'text',revisionField:'revision',
      target:view=>({key:JSON.stringify([view.queryContext['pageId'],view.queryContext['fileName']]),
        fields:{pageId:view.queryContext['pageId'],fileName:view.queryContext['fileName']}}),transport})
    try{
      const first=dataSet.getView('Files')!
      first.bindQueryExecutor(executor,{resource:{resourceType:'file',resourceId:'page-files'}})
      await first.refresh()
      const second=first.createQueryView('script-file')
      second.queryContext={pageId:'PAGE',fileName:'script.js'}
      await second.loadFromServer({singleFlight:false})
      await first.editRowById(first.getPkKey(first.rows[0]!)!,{text:'rule-new'})
      await second.editRowById(second.getPkKey(second.rows[0]!)!,{text:'script-new'})
      await expect(dataSet.saveChanges()).rejects.toThrow('explicit source rejection')
      expect(first.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(second.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(files.get('rule.json')).toBe('rule-new')
      expect(files.get('script.js')).toBe('script-old')
      expect((await dataSet.saveChanges()).success).toBe(true)
      expect(writes).toEqual(['rule.json','script.js','script.js'])
      expect(files.get('script.js')).toBe('script-new')
      expect(first.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(second.dirtyTracking.hasPendingChanges()).toBe(false)
    }finally{dataSet.destroy()}
  })

  it('retains unknown write identity across DataView destruction and rebinds within the same DataSet',async()=>{
    const f=fixture()
    try {
      await f.view.refresh();const id=f.view.getPkKey(f.view.rows[0]!)!
      await f.view.editRowById(id,{text:'accepted'})
      f.write.mockImplementationOnce(async({text})=>{f.current.text=text;throw new Error('timeout')})
      await expect(f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'default',ids:[id]}]})).rejects.toThrow('timeout')
      f.dataSet.getTable('Files')!.destroyView('default')
      const reopened=f.dataSet.getTable('Files')!.getOrCreateView('reopened')
      reopened.queryContext={pageId:'PAGE',fileName:'rule.json'}
      f.bind(reopened);await reopened.refresh()
      const reopenedId=reopened.getPkKey(reopened.rows[0]!)!
      await reopened.editRowById(reopenedId,{text:'later edit'})
      await expect(f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'reopened',ids:[reopenedId]}]}))
        .rejects.toThrow('FILE_RESOURCE_UNKNOWN_DELIVERY')
      expect(reopened.hasUnconfirmedSave).toBe(true)
      expect(f.write).toHaveBeenCalledOnce()
      expect(f.current.text).toBe('accepted')
      await expect(reopened.verifySourceWriteAttempt()).resolves.toEqual({state:'confirmed',text:'accepted',message:null})
      reopened.acknowledgeSourceWriteAttempt()
      expect(reopened.hasUnconfirmedSave).toBe(false)
      expect((await f.dataSet.saveChanges({views:[{tableName:'Files',viewId:'reopened',ids:[reopenedId]}]})).success).toBe(true)
      expect(f.write).toHaveBeenCalledTimes(2)
      expect(f.current.text).toBe('later edit')
    } finally {f.dataSet.destroy()}
  })

  it('exposes source preview through the DataView source API',async()=>{
    const f=fixture()
    try {
      await f.view.refresh()
      expect(await f.view.previewSource()).toEqual({version:'v1',content:'baseline'})
    } finally {f.dataSet.destroy()}
  })

  it('rejects a snapshot when the remote file no longer matches the clean DataView baseline',async()=>{
    const f=fixture()
    try {
      await f.view.refresh()
      f.current.text='changed remotely'
      await expect(f.view.createSourceVersion()).rejects.toThrow('FILE_RESOURCE_SOURCE_CONFLICT')
      expect(f.versions.size).toBe(0)
      expect(f.view.rows[0]).toMatchObject({text:'baseline',revision:'v1'})
    } finally {f.dataSet.destroy()}
  })

  it('retains an uploaded snapshot as unknown when local readback fails and only retries its original receipt',async()=>{
    const f=fixture()
    try {
      await f.view.refresh()
      const create=vi.spyOn(f.history,'create').mockImplementationOnce(async(_target,text,onAttempt)=>{
        onAttempt({version:1,fileName:'1__rule.json'})
        f.versions.set(1,text)
        throw new Error('readback scope changed after upload')
      })
      await expect(f.view.createSourceVersion()).rejects.toThrow('readback scope changed after upload')
      expect(f.view.getSourceHistoryStatus()).toMatchObject({state:'unknown',version:1,fileName:'1__rule.json'})
      await expect(f.view.createSourceVersion()).resolves.toMatchObject({state:'confirmed',version:1,fileName:'1__rule.json'})
      expect(create).toHaveBeenCalledOnce()
      expect(f.versions.get(1)).toBe('baseline')
    } finally {f.dataSet.destroy()}
  })

  it('retains a source-history unknown attempt across DataView destruction and verifies the same version',async()=>{
    const f=fixture()
    try {
      await f.view.refresh()
      await expect(f.view.createSourceVersion()).rejects.toThrow('timeout')
      expect(f.view.getSourceHistoryStatus()).toMatchObject({state:'unknown',version:1,fileName:'1__rule.json'})
      f.dataSet.getTable('Files')!.destroyView('default')
      const reopened=f.dataSet.getTable('Files')!.getOrCreateView('reopened')
      reopened.queryContext={pageId:'PAGE',fileName:'rule.json'}
      f.bind(reopened);await reopened.refresh()
      expect(reopened.getSourceHistoryStatus()).toMatchObject({state:'unknown',version:1,fileName:'1__rule.json'})
      await expect(reopened.verifySourceHistoryAttempt()).resolves.toMatchObject({state:'confirmed',version:1,fileName:'1__rule.json'})
      expect(f.versions.get(1)).toBe('baseline')
    } finally {f.dataSet.destroy()}
  })

  it('marks a captured source-history attempt not-applied after a definite rejection and keeps its identity',async()=>{
    const f=fixture(true)
    try {
      await f.view.refresh()
      await expect(f.view.createSourceVersion()).rejects.toThrow('explicit history rejection')
      expect(f.view.getSourceHistoryStatus()).toEqual({state:'not-applied',version:1,fileName:'1__rule.json',message:'explicit history rejection'})
      expect(f.versions.has(1)).toBe(false)
    } finally {f.dataSet.destroy()}
  })
})
