import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import {bindFileDirectoryQueryAdapter,bindFileResourceAdapter, type FileResourceTransport} from '../../query/file-resource-adapter'

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
