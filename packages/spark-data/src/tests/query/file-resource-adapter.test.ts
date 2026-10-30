import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import {bindFileDirectoryQueryAdapter,bindFileResourceAdapter,createFileResourceAdapterExecutor, type FileResourceTransport} from '../../query/file-resource-adapter'

function fixture(rejectHistoryBeforeWrite=false) {
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
  const bind=(targetView:typeof view)=>bindFileResourceAdapter(targetView,{resourceId:'page-files',contentField:'text',revisionField:'revision',
    target:target=>({key:JSON.stringify([target.queryContext['pageId'],target.queryContext['fileName']]),fields:{pageId:target.queryContext['pageId'],fileName:target.queryContext['fileName']}}),transport})
  bind(view)
  return {dataSet,view,current,read,write,remove,bind,versions,history,transport}
}

describe('DataView file resource adapter',()=>{
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
