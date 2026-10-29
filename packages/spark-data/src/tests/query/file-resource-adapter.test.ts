import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import {bindFileResourceAdapter, type FileResourceTransport} from '../../query/file-resource-adapter'

function fixture(rejectHistoryBeforeWrite=false) {
  const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{Files:{resourceType:'file',resourceId:'page-files',
    columns:[{name:'fileKey',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'fileName',type:'string'},
      {name:'text',type:'string'},{name:'revision',type:'string'}],views:{default:{commitMode:'staged',queryContext:{pageId:'PAGE',fileName:'rule.json'}}}}}})
  const view=dataSet.getView('Files')!
  const current={text:'baseline',revision:'v1'}
  const versions=new Map<number,string>()
  const read=vi.fn(async()=>({...current}))
  const write=vi.fn(async(_input:{text:string})=>{current.text=_input.text;current.revision='v2'})
  const history:NonNullable<FileResourceTransport['history']>={
    list:async target=>[...versions.keys()].map(version=>({version,fileName:`${version}__${String(target.fields['fileName'])}`,lastModified:null})),
    preview:async(_target,version)=>versions.get(Number(version))??'',
    create:async(target,text,onAttempt)=>{const version=Math.max(0,...versions.keys())+1;onAttempt({version,fileName:`${version}__${String(target.fields['fileName'])}`})
      if(rejectHistoryBeforeWrite)throw new Error('explicit history rejection')
      versions.set(version,text);throw new Error('timeout')},
    verify:async(_target,attempt,expectedText)=>versions.get(Number(attempt.version))===expectedText,
  }
  const transport:FileResourceTransport={read,write,history,isUnknown:error=>error instanceof Error&&error.message==='timeout'}
  const bind=(targetView:typeof view)=>bindFileResourceAdapter(targetView,{resourceId:'page-files',contentField:'text',revisionField:'revision',
    target:target=>({key:JSON.stringify([target.queryContext['pageId'],target.queryContext['fileName']]),fields:{pageId:target.queryContext['pageId'],fileName:target.queryContext['fileName']}}),transport})
  bind(view)
  return {dataSet,view,current,read,write,bind,versions}
}

describe('DataView file resource adapter',()=>{
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
