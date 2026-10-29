import {describe, expect, it, vi} from 'vitest'
import {SparkData} from '@spark-appworks/spark-data'
import {PageTool} from '@spark-appworks/spark-project-model'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {PageToolFileCommands,createChildPageWithFiles,assertRecoveredChildPermission} from '../../../src/lowcode/resources/shared/page-tool-files-command'

function timeoutAfterAccept():Error{const error=new Error('timeout after accept');error.name='RequestError';Object.assign(error,{config:{url:'/test'}});return error}
function responseFailureAfterAccept():Error{const error=new Error('readback response failed');error.name='RequestError';Object.assign(error,{config:{url:'/api/File/DownFile'},response:{status:404}});return error}

describe('PageToolFileCommands',()=>{
  it('restores an exact listed file version through its DataView command and returns confirmed text',async()=>{
    const files=new Map([['script.js','working baseline']]),snapshots=new Map([[`APP/PAGE/4__script.js`,'restored text']])
    const upload=vi.fn(),restoreWorkingFile=vi.fn(async(command:{fileName:string;text:string})=>{files.set(command.fileName,command.text)})
    const dataSet=SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),save=vi.spyOn(dataSet,'saveChanges'),owner=new PageToolFileCommands(dataSet,'APP',{
      list:async()=>[...files.keys()],read:async(_a:string,_p:string,n:string)=>files.get(n)??null,upload,restoreWorkingFile,remove:async()=>{},
      listVersions:async()=>[{version:4,fileName:'4__script.js',lastModified:null}],
      readVersion:async()=>snapshots.get('APP/PAGE/4__script.js')??null,
    },()=>{})
    await expect(owner.restoreVersion({pageId:'PAGE',customPath:'APP/PAGE',fileName:'script.js',version:4,baselineText:'working baseline',sourceText:'restored text',assertCurrent:()=>{}})).resolves.toBe('restored text')
    expect(save).toHaveBeenCalledWith({views:[{tableName:'PageToolFilesCommand',viewId:'default',ids:[expect.any(String)]}]})
    expect(restoreWorkingFile).toHaveBeenCalledWith({appId:'APP',pageId:'PAGE',fileName:'script.js',text:'restored text'})
    expect(upload).not.toHaveBeenCalled()
    expect(files.get('script.js')).toBe('restored text')
  })

  it('rejects restore if the working file changed since the command baseline without uploading',async()=>{
    const upload=vi.fn(),read=vi.fn().mockResolvedValue('changed remotely')
    const owner=new PageToolFileCommands(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
      list:async()=>[],read,upload,remove:async()=>{},
      listVersions:async()=>[{version:4,fileName:'4__script.js',lastModified:null}],readVersion:async()=> 'restored text',
    },()=>{})
    await expect(owner.restoreVersion({pageId:'PAGE',customPath:'APP/PAGE',fileName:'script.js',version:4,baselineText:'captured baseline',sourceText:'restored text',assertCurrent:()=>{}})).rejects.toThrow('PAGE_TOOL_RESTORE_CONFLICT')
    expect(upload).not.toHaveBeenCalled()
  })

  it('rejects a restore command whose customPath does not exactly match its page identity',async()=>{
    const listVersions=vi.fn(async()=>[{version:4,fileName:'4__script.js',lastModified:null}])
    const owner=new PageToolFileCommands(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
      list:async()=>[],read:async()=> 'baseline',upload:async()=>{},remove:async()=>{},listVersions,readVersion:async()=> 'restored text',
    },()=>{})
    await expect(owner.restoreVersion({pageId:'PAGE',customPath:'APP/OTHER',fileName:'script.js',version:4,baselineText:'baseline',sourceText:'restored text',assertCurrent:()=>{}}))
      .rejects.toThrow('PAGE_TOOL_RESTORE_TARGET')
    expect(listVersions).not.toHaveBeenCalled()
  })

  it('verifies an unknown restore receipt against the same DataView command without replay',async()=>{
    const files=new Map([['script.js','working baseline']]),upload=vi.fn(),restoreWorkingFile=vi.fn(async(command:{fileName:string;text:string})=>{files.set(command.fileName,command.text);throw timeoutAfterAccept()})
    const dataSet=SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),owner=new PageToolFileCommands(dataSet,'APP',{
      list:async()=>[...files.keys()],read:async(_a:string,_p:string,n:string)=>files.get(n)??null,upload,restoreWorkingFile,remove:async()=>{},
      listVersions:async()=>[{version:4,fileName:'4__script.js',lastModified:null}],readVersion:async()=> 'restored text',
    },()=>{})
    const input={pageId:'PAGE',customPath:'APP/PAGE',fileName:'script.js' as const,version:4,baselineText:'working baseline',sourceText:'restored text',assertCurrent:()=>{}}
    await expect(owner.restoreVersion(input)).rejects.toThrow('timeout after accept')
    const commandId=owner.view.rows[0]?.['commandId']
    await expect(owner.restoreVersion(input)).resolves.toBe('restored text')
    expect(owner.view.rows[0]?.['commandId']).toBe(commandId)
    expect(restoreWorkingFile).toHaveBeenCalledOnce()
  })

  it('confirms an applied restore after owner readback was unknown without uploading again',async()=>{
    const files=new Map([['script.js','working baseline']]),upload=vi.fn(),restoreWorkingFile=vi.fn(async(command:{fileName:string;text:string})=>{
      files.set(command.fileName,command.text)
    }),read=vi.fn(async(_app:string,_page:string,name:string)=>{
      if(name==='script.js'&&read.mock.calls.length===2)throw timeoutAfterAccept()
      return files.get(name)??null
    })
    const dataSet=SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),owner=new PageToolFileCommands(dataSet,'APP',{
      list:async()=>[...files.keys()],read,upload,restoreWorkingFile,remove:async()=>{},
      listVersions:async()=>[{version:4,fileName:'4__script.js',lastModified:null}],readVersion:async()=> 'restored text',
    },()=>{})
    const input={pageId:'PAGE',customPath:'APP/PAGE',fileName:'script.js' as const,version:4,baselineText:'working baseline',sourceText:'restored text',assertCurrent:()=>{}}
    await expect(owner.restoreVersion(input)).rejects.toThrow('PAGE_TOOL_RESTORE_UNCONFIRMED')
    await expect(dataSet.resolveUnconfirmedSaves()).resolves.toBe('confirmed')
    await expect(owner.restoreVersion(input)).resolves.toBe('restored text')
    expect(restoreWorkingFile).toHaveBeenCalledOnce()
    expect(upload).not.toHaveBeenCalled()
    expect(files.get('script.js')).toBe('restored text')
  })

  it('keeps an applied restore unknown when the upload adapter readback returns an HTTP response error',async()=>{
    const files=new Map([['script.js','working baseline']]),restoreWorkingFile=vi.fn(async(command:{fileName:string;text:string})=>{
      files.set(command.fileName,command.text);throw responseFailureAfterAccept()
    })
    const dataSet=SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),owner=new PageToolFileCommands(dataSet,'APP',{
      list:async()=>[...files.keys()],read:async(_app:string,_page:string,name:string)=>files.get(name)??null,upload:async()=>{},restoreWorkingFile,remove:async()=>{},
      listVersions:async()=>[{version:4,fileName:'4__script.js',lastModified:null}],readVersion:async()=> 'restored text',
    },()=>{})
    const input={pageId:'PAGE',customPath:'APP/PAGE',fileName:'script.js' as const,version:4,baselineText:'working baseline',sourceText:'restored text',assertCurrent:()=>{}}
    await expect(owner.restoreVersion(input)).rejects.toThrow('PAGE_TOOL_RESTORE_UNCONFIRMED')
    await expect(dataSet.resolveUnconfirmedSaves()).resolves.toBe('confirmed')
    await expect(owner.restoreVersion(input)).resolves.toBe('restored text')
    expect(restoreWorkingFile).toHaveBeenCalledOnce()
  })

  it('preserves an explicit backend restore rejection instead of treating it as unknown',async()=>{
    const denied=new LowcodeApiError(403,'restore forbidden'),restoreWorkingFile=vi.fn().mockRejectedValue(denied)
    const owner=new PageToolFileCommands(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
      list:async()=>[],read:async()=> 'working baseline',upload:async()=>{},restoreWorkingFile,remove:async()=>{},
      listVersions:async()=>[{version:4,fileName:'4__script.js',lastModified:null}],readVersion:async()=> 'restored text',
    },()=>{})
    await expect(owner.restoreVersion({pageId:'PAGE',customPath:'APP/PAGE',fileName:'script.js',version:4,baselineText:'working baseline',sourceText:'restored text',assertCurrent:()=>{}}))
      .rejects.toBe(denied)
    expect(owner.view.hasUnconfirmedSave).toBe(false)
    expect(restoreWorkingFile).toHaveBeenCalledOnce()
  })

  it('verifies an unknown restore after the original UI guard turns stale and only delivers the receipt when current again',async()=>{
    const files=new Map([['script.js','working baseline']]),upload=vi.fn(),restoreWorkingFile=vi.fn(async(command:{fileName:string;text:string})=>{files.set(command.fileName,command.text);throw timeoutAfterAccept()})
    const dataSet=SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),save=vi.spyOn(dataSet,'saveChanges'),owner=new PageToolFileCommands(dataSet,'APP',{
      list:async()=>[...files.keys()],read:async(_a:string,_p:string,n:string)=>files.get(n)??null,upload,restoreWorkingFile,remove:async()=>{},
      listVersions:async()=>[{version:4,fileName:'4__script.js',lastModified:null}],readVersion:async()=> 'restored text',
    },()=>{})
    let uiCurrent=true
    const input={pageId:'PAGE',customPath:'APP/PAGE',fileName:'script.js' as const,version:4,baselineText:'working baseline',sourceText:'restored text',assertCurrent:()=>{if(!uiCurrent)throw Error('UI target switched')}}
    await expect(owner.restoreVersion(input)).rejects.toThrow('timeout after accept')
    uiCurrent=false
    await expect(dataSet.resolveUnconfirmedSaves()).resolves.toBe('confirmed')
    await expect(owner.restoreVersion(input)).rejects.toThrow('UI target switched')
    uiCurrent=true
    await expect(owner.restoreVersion(input)).resolves.toBe('restored text')
    expect(restoreWorkingFile).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('checks parent permission before creating files and compensates known navigation rejection',async()=>{
    const create=vi.fn(async()=> 'PAGE'),add=vi.fn(async()=>{}),compensate=vi.fn(async()=>{})
    await expect(createChildPageWithFiles({parentId:'P',assertParent:()=>{throw Error('c denied')},createFiles:create,addNode:add,isNodeReceiptUnknown:()=>false,compensate})).rejects.toThrow('c denied')
    expect(create).not.toHaveBeenCalled()
    await expect(createChildPageWithFiles({parentId:'P',assertParent:()=>{},createFiles:create,addNode:async()=>{throw Error('navigation rejected')},isNodeReceiptUnknown:()=>false,compensate})).rejects.toThrow('navigation rejected')
    expect(compensate).toHaveBeenCalledWith('PAGE','P')
  })

  it('does not compensate when navigation receipt is unknown so the original DataView row can recover',async()=>{
    const create=vi.fn(async()=> 'PAGE'),add=vi.fn(async()=>{throw timeoutAfterAccept()}),compensate=vi.fn(async()=>{})
    await expect(createChildPageWithFiles({parentId:'P',assertParent:()=>{},createFiles:create,addNode:add,isNodeReceiptUnknown:()=>true,compensate})).rejects.toThrow('timeout after accept')
    expect(compensate).not.toHaveBeenCalled()
    expect(await createChildPageWithFiles({parentId:'P',assertParent:()=>{},createFiles:async()=> 'PAGE',addNode:async()=>{},isNodeReceiptUnknown:()=>false,compensate})).toBe('PAGE')
  })
  it('compensates a recovered file set when parent c permission is revoked',async()=>{
    const compensate=vi.fn(async()=>{})
    await expect(assertRecoveredChildPermission({parentId:'P',pageId:'PAGE',assertParent:()=>{throw Error('c revoked')},compensate})).rejects.toThrow('c revoked')
    expect(compensate).toHaveBeenCalledWith('PAGE','P')
  })
  it('recovers an unknown create by the original command identity without replay',async()=>{
    const files=new Map<string,string>(), upload=vi.fn(async(command:{fileName:string;text:string})=>{files.set(command.fileName,command.text)}), remove=vi.fn(async(_app:string,_page:string,name:string)=>{files.delete(name)})
    const io={list:async()=>[...files.keys()],read:async(_app:string,_page:string,name:string)=>files.get(name)??null,upload,remove}
    const dataSet=SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{X:{tableName:'X',columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{rows:[]}}}}})
    const resource=new PageToolFileCommands(dataSet,'APP',io,()=>{})
    upload.mockImplementationOnce(async(command)=>{files.set(command.fileName,command.text);throw timeoutAfterAccept()})
    await expect(resource.create('PARENT')).rejects.toThrow('timeout after accept')
    await expect(resource.create('PARENT')).rejects.toThrow('DATA_SET_COMMAND_NOT_APPLIED')
    expect(upload).toHaveBeenCalledTimes(1)
    const pageId=await resource.create('PARENT')
    expect(upload).toHaveBeenCalledTimes(4)
    expect(resource.view.rows.filter(row=>row['parentId']==='PARENT'&&row['pageId']===pageId)).toHaveLength(1)
  })
  it('retries a known page-file rejection through its own dirty command row',async()=>{
    const files=new Map<string,string>(),upload=vi.fn(async(command:{fileName:string;text:string})=>{files.set(command.fileName,command.text)})
    const resource=new PageToolFileCommands(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
      list:async()=>[...files.keys()],read:async(_a:string,_p:string,n:string)=>files.get(n)??null,
      upload,remove:async(_a:string,_p:string,n:string)=>{files.delete(n)},
    },()=>{})
    upload.mockRejectedValueOnce(Error('explicit upload rejection'))
    await expect(resource.create('PARENT')).rejects.toThrow('explicit upload rejection')
    expect(resource.hasPendingCommandForParent('PARENT')).toBe(true)
    const idBefore=resource.view.rows[0]?.['commandId']
    await resource.create('PARENT')
    expect(resource.view.rows.filter(row=>row['parentId']==='PARENT')).toHaveLength(1)
    expect(resource.view.rows[0]?.['commandId']).toBe(idBefore)
  })

  it('resumes partial compensation with the same command row',async()=>{
    const page=new PageTool({pageId:'PAGE'});page.markLoaded()
    const files=new Map([['rule.json',page.getFileText('rule.json')],['script.js',page.getFileText('script.js')],['style.css',page.getFileText('style.css')]]),remove=vi.fn(async(_a:string,_p:string,n:string)=>{files.delete(n)})
    const io={list:async()=>[...files.keys()],read:async(_a:string,_p:string,n:string)=>files.get(n)??null,upload:async()=>{},remove}
    const resource=new PageToolFileCommands(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',io,()=>{})
    remove.mockImplementationOnce(async(_a,_p,n)=>{files.delete(n);throw timeoutAfterAccept()})
    await expect(resource.compensateCreate('PAGE','PARENT')).rejects.toThrow('timeout after accept')
    await expect(resource.compensateCreate('PAGE','PARENT')).resolves.toBeUndefined()
    expect([...files.keys()]).toEqual([])
    expect(resource.view.rows.filter(row=>row['parentId']==='PARENT'&&row['pageId']==='PAGE')).toHaveLength(1)
  })

  it('does not delete files that existed before a create attempt',async()=>{
    const remove=vi.fn(), files=new Map([['rule.json','existing']])
    const resource=new PageToolFileCommands(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
      list:async()=>[...files.keys()],read:async(_a:string,_p:string,n:string)=>files.get(n)??null,
      upload:async()=>{throw Error('must not upload')},remove:async(...args:Parameters<typeof remove>)=>remove(...args),
    },()=>{})
    await expect(resource.create('PARENT')).rejects.toThrow(/FILE_EXISTS/)
    expect(remove).not.toHaveBeenCalled()
  })

  it('does not enter unknown-receipt verification for an explicit upload rejection',async()=>{
    const read=vi.fn(async()=>null),list=vi.fn(async()=>[]),resource=new PageToolFileCommands(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
      list,read,upload:async()=>{throw Error('explicit Code 403 rejection')},remove:async()=>{},
    },()=>{})
    await expect(resource.create('PARENT')).rejects.toThrow('explicit Code 403 rejection')
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('compensates only unchanged default files and preserves a file edited after creation',async()=>{
    const defaults=new PageTool({pageId:'PAGE'});defaults.markLoaded()
    const files=new Map([['rule.json',defaults.getFileText('rule.json')],['script.js','edited-script']]),remove=vi.fn(async(_a:string,_p:string,n:string)=>{files.delete(n)})
    const io={list:async()=>[...files.keys()],read:async(_a:string,_p:string,n:string)=>files.get(n)??null,upload:async()=>{},remove}
    const resource=new PageToolFileCommands(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',io,()=>{})
    await expect(resource.compensateCreate('PAGE','PARENT')).resolves.toBeUndefined()
    expect([...files.entries()]).toEqual([['script.js','edited-script']])
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('deletes every page file and version entry through one DataView command, then confirms an empty directory',async()=>{
    const files=new Map([['rule.json','{}'],['script.js','x'],['2__rule.json','snapshot'],['3__style.css','snapshot-style']])
    const operations:string[]=[],remove=vi.fn(async(_app:string,_page:string,name:string)=>{operations.push(`remove:${name}`);files.delete(name)})
    const dataSet=SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}})
    const save=vi.spyOn(dataSet,'saveChanges')
    const resource=new PageToolFileCommands(dataSet,'APP',{list:async()=>{operations.push('list');return [...files.keys()]},read:async(_a:string,_p:string,n:string)=>files.get(n)??null,
      upload:async()=>{},remove},()=>{})
    await expect(resource.deletePageFiles('PAGE','APP/PAGE')).resolves.toBeUndefined()
    expect(save).toHaveBeenCalledWith({views:[{tableName:'PageToolFilesCommand',viewId:'default',ids:[expect.any(String)]}]})
    expect(remove).toHaveBeenCalledTimes(4)
    expect([...files.keys()]).toEqual([])
    expect(operations[0]).toBe('list')
    expect(operations.findIndex(operation=>operation.startsWith('remove:'))).toBeGreaterThan(operations.indexOf('list'))
  })

  it('retains a known failed delete command and retries the same commandId',async()=>{
    const files=new Map([['rule.json','{}'],['script.js','x']]),remove=vi.fn(async(_a:string,_p:string,n:string)=>{files.delete(n)})
    remove.mockImplementationOnce(async(_a,_p,n)=>{files.delete(n);throw Error('explicit file delete rejection')})
    const resource=new PageToolFileCommands(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
      list:async()=>[...files.keys()],read:async(_a:string,_p:string,n:string)=>files.get(n)??null,upload:async()=>{},remove,
    },()=>{})
    await expect(resource.deletePageFiles('PAGE','APP/PAGE')).rejects.toThrow('explicit file delete rejection')
    const commandId=resource.view.rows[0]?.['commandId']
    await expect(resource.deletePageFiles('PAGE','APP/PAGE')).resolves.toBeUndefined()
    expect(resource.view.rows[0]?.['commandId']).toBe(commandId)
    expect(remove).toHaveBeenCalledTimes(2)
    expect([...files.keys()]).toEqual([])
  })

  it('verifies a partial unknown deletion then continues remaining files with the same commandId',async()=>{
    const files=new Map([['rule.json','{}'],['script.js','x']]),remove=vi.fn(async(_a:string,_p:string,n:string)=>{files.delete(n)})
    remove.mockImplementationOnce(async(_a,_p,n)=>{files.delete(n);throw timeoutAfterAccept()})
    const resource=new PageToolFileCommands(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
      list:async()=>[...files.keys()],read:async(_a:string,_p:string,n:string)=>files.get(n)??null,upload:async()=>{},remove,
    },()=>{})
    await expect(resource.deletePageFiles('PAGE','APP/PAGE')).rejects.toThrow('timeout after accept')
    const commandId=resource.view.rows[0]?.['commandId']
    await expect(resource.deletePageFiles('PAGE','APP/PAGE')).rejects.toThrow('DATA_SET_COMMAND_NOT_APPLIED')
    expect(remove).toHaveBeenCalledTimes(1)
    await expect(resource.deletePageFiles('PAGE','APP/PAGE')).resolves.toBeUndefined()
    expect(resource.view.rows[0]?.['commandId']).toBe(commandId)
    expect(remove).toHaveBeenCalledTimes(2)
    expect([...files.keys()]).toEqual([])
  })

  it('verifies an unknown delete receipt and retries the same commandId without blind replay',async()=>{
    const files=new Map([['rule.json','{}']]),remove=vi.fn(async(_a:string,_p:string,n:string)=>{files.delete(n);throw timeoutAfterAccept()})
    const list=vi.fn(async()=>[...files.keys()]),dataSet=SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}})
    const resource=new PageToolFileCommands(dataSet,'APP',{list,read:async(_a:string,_p:string,n:string)=>files.get(n)??null,upload:async()=>{},remove},()=>{})
    await expect(resource.deletePageFiles('PAGE','APP/PAGE')).rejects.toThrow('timeout after accept')
    const commandId=resource.view.rows[0]?.['commandId']
    await expect(resource.deletePageFiles('PAGE','APP/PAGE')).resolves.toBeUndefined()
    expect(resource.view.rows[0]?.['commandId']).toBe(commandId)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(4)
    expect([...files.keys()]).toEqual([])
  })

  it('rejects a stale or cross-scope delete before touching the file directory',async()=>{
    const remove=vi.fn(),assertCurrent=vi.fn(()=>{throw Error('scope stale')}),list=vi.fn(async()=>['rule.json'])
    const resource=new PageToolFileCommands(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
      list,read:async()=>null,upload:async()=>{},remove,
    },assertCurrent)
    await expect(resource.deletePageFiles('PAGE','OTHER/PAGE')).rejects.toThrow()
    expect(list).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('preflights the exact page directory and file names before the blueprint delete phase',async()=>{
    const list=vi.fn(async()=>['rule.json','2__rule.json']),dataSet=SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}})
    const resource=new PageToolFileCommands(dataSet,'APP',{
      list,read:async()=>null,upload:async()=>{},remove:async()=>{},
    },()=>{})
    await expect(resource.preflightDeletePageFiles('PAGE','APP/PAGE')).resolves.toBeUndefined()
    expect(list).toHaveBeenCalledOnce()
    expect(dataSet.getTable('PageToolFilesDirectory')).toBeDefined()
    expect(resource.directoryView.rows.map(row=>row['fileName'])).toEqual(['rule.json','2__rule.json'])
    await expect(resource.preflightDeletePageFiles('PAGE','APP/OTHER')).rejects.toThrow('PAGE_TOOL_FILE_DELETE_SCOPE')
    expect(list).toHaveBeenCalledOnce()
  })

  it('refuses the directory delete command when the DataView preflight reports an unsafe entry',async()=>{
    const list=vi.fn(async()=>['../outside']),remove=vi.fn(),dataSet=SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}})
    const save=vi.spyOn(dataSet,'saveChanges'),resource=new PageToolFileCommands(dataSet,'APP',{
      list,read:async()=>null,upload:async()=>{},remove,
    },()=>{})
    await expect(resource.deletePageFiles('PAGE','APP/PAGE')).rejects.toThrow('PAGE_TOOL_FILE_DELETE_SCOPE')
    expect(resource.directoryView.rows.map(row=>row['fileName'])).toEqual(['../outside'])
    expect(save).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

})
