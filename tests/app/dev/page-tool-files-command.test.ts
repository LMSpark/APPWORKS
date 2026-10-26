import {describe, expect, it, vi} from 'vitest'
import {SparkData} from '@spark-appworks/spark-data'
import {PageTool} from '@spark-appworks/spark-project-model'
import {PageToolFilesDataView,createChildPageWithFiles,assertRecoveredChildPermission} from '../../../src/lowcode/resources/shared/page-tool-files-command'

function timeoutAfterAccept():Error{const error=new Error('timeout after accept');error.name='RequestError';Object.assign(error,{config:{url:'/test'}});return error}

describe('PageToolFilesDataView',()=>{
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
    const resource=new PageToolFilesDataView(dataSet,'APP',io,()=>{})
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
    const resource=new PageToolFilesDataView(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
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
    const resource=new PageToolFilesDataView(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',io,()=>{})
    remove.mockImplementationOnce(async(_a,_p,n)=>{files.delete(n);throw timeoutAfterAccept()})
    await expect(resource.compensateCreate('PAGE','PARENT')).rejects.toThrow('timeout after accept')
    await expect(resource.compensateCreate('PAGE','PARENT')).resolves.toBeUndefined()
    expect([...files.keys()]).toEqual([])
    expect(resource.view.rows.filter(row=>row['parentId']==='PARENT'&&row['pageId']==='PAGE')).toHaveLength(1)
  })

  it('does not delete files that existed before a create attempt',async()=>{
    const remove=vi.fn(), files=new Map([['rule.json','existing']])
    const resource=new PageToolFilesDataView(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
      list:async()=>[...files.keys()],read:async(_a:string,_p:string,n:string)=>files.get(n)??null,
      upload:async()=>{throw Error('must not upload')},remove:async(...args:Parameters<typeof remove>)=>remove(...args),
    },()=>{})
    await expect(resource.create('PARENT')).rejects.toThrow(/FILE_EXISTS/)
    expect(remove).not.toHaveBeenCalled()
  })

  it('does not enter unknown-receipt verification for an explicit upload rejection',async()=>{
    const read=vi.fn(async()=>null),list=vi.fn(async()=>[]),resource=new PageToolFilesDataView(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',{
      list,read,upload:async()=>{throw Error('explicit Code 403 rejection')},remove:async()=>{},
    },()=>{})
    await expect(resource.create('PARENT')).rejects.toThrow('explicit Code 403 rejection')
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('compensates only unchanged default files and preserves a file edited after creation',async()=>{
    const defaults=new PageTool({pageId:'PAGE'});defaults.markLoaded()
    const files=new Map([['rule.json',defaults.getFileText('rule.json')],['script.js','edited-script']]),remove=vi.fn(async(_a:string,_p:string,n:string)=>{files.delete(n)})
    const io={list:async()=>[...files.keys()],read:async(_a:string,_p:string,n:string)=>files.get(n)??null,upload:async()=>{},remove}
    const resource=new PageToolFilesDataView(SparkData.createDataSet({dataSetName:'test',scenarioId:'SCENE',tables:{}}),'APP',io,()=>{})
    await expect(resource.compensateCreate('PAGE','PARENT')).resolves.toBeUndefined()
    expect([...files.entries()]).toEqual([['script.js','edited-script']])
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
