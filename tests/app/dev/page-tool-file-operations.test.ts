import {describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import appConfig from '../../../config/pages/application/project-blueprint/pagedata.json'
import {compensatePageToolFiles,createPageToolFiles,deletePageToolFiles,listPageToolFileNames,type PageFileOperationScope} from '../../../src/services/project/page-tool-file-operations'
import type {createPageToolFilesIo} from '../../../src/lowcode/lowcode-runtime'

const storage=vi.hoisted(()=>({io:undefined as unknown}))
vi.mock('@/lowcode/lowcode-runtime',async importOriginal=>({...await importOriginal<typeof import('@/lowcode/lowcode-runtime')>(),createPageToolFilesIo:()=>storage.io}))

function timeoutAfterAccept():Error{const error=new Error('timeout after accept');error.name='RequestError';Object.assign(error,{config:{url:'/test'}});return error}
function createScope(files:Map<string,string>,remove:(appId:string,pageId:string,fileName:string)=>Promise<void>):PageFileOperationScope{
  const io={list:vi.fn(async(_appId:string,pageId:string)=>[...files.keys()].filter(path=>path.startsWith(`${pageId}/`)).map(path=>path.slice(pageId.length+1))),
    read:vi.fn(async(_appId:string,pageId:string,fileName:string)=>files.get(`${pageId}/${fileName}`)??null),
    upload:vi.fn(async({pageId,fileName,text}:{appId:string;pageId:string;fileName:string;text:string})=>{files.set(`${pageId}/${fileName}`,text)}),
    remove:vi.fn(async(appId:string,pageId:string,fileName:string)=>remove(appId,pageId,fileName)),
    listVersions:vi.fn(async()=>[]),uploadVersion:vi.fn(async()=>{}),readVersion:vi.fn(async()=>null),
  } as unknown as ReturnType<typeof createPageToolFilesIo>
  const dataSet=DataSet.fromJson({scenarioId:'7AB874097A1E8711A42FD845939A6E05',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
  storage.io=io
  return {dataSet,appId:'APP',pageId:'PAGE',assertCurrent:()=>{}}
}

describe('PageTool files use the formal ProjectToolFile DataView chain',()=>{
  it('creates and compensates only unchanged standard files while preserving snapshots and extra basenames',async()=>{
    const files=new Map<string,string>([['PAGE/4__script.js','snapshot'],['PAGE/extra-template.txt','extra']])
    const remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    const scope=createScope(files,remove),save=vi.spyOn(scope.dataSet,'saveChanges')
    try{
      await createPageToolFiles(scope)
      expect(save.mock.calls.flatMap(([request])=>request?.views??[]).filter(view=>view.tableName==='ProjectToolFile')).toHaveLength(3)
      expect(files.size).toBe(5)
      files.set('PAGE/script.js','user edited')
      await compensatePageToolFiles(scope)
      expect(remove.mock.calls.map(([,pageId,name])=>`${pageId}/${name}`)).toEqual(['PAGE/rule.json','PAGE/style.css'])
      expect([...files.keys()].sort()).toEqual(['PAGE/4__script.js','PAGE/extra-template.txt','PAGE/script.js'])
      expect(scope.dataSet.getTable('PageToolFilesCommand')).toBeUndefined()
      expect(scope.dataSet.getTable('PageToolFilesDirectory')).toBeUndefined()
    }finally{scope.dataSet.destroy()}
  })

  it('confirms an unknown default-file create through the same DataView before continuing without replay',async()=>{
    const files=new Map<string,string>(),scope=createScope(files,async(_app,pageId,fileName)=>{files.delete(`${pageId}/${fileName}`)})
    const io=storage.io as ReturnType<typeof createPageToolFilesIo>,upload=vi.mocked(io.upload)
    upload.mockImplementationOnce(async({pageId,fileName,text})=>{files.set(`${pageId}/${fileName}`,text);throw timeoutAfterAccept()})
    try{
      await expect(createPageToolFiles(scope)).rejects.toThrow('timeout after accept')
      const ruleView=scope.dataSet.getTable('ProjectToolFile')?.viewList.find(view=>view.queryContext['pageId']==='PAGE'&&view.queryContext['fileName']==='rule.json')
      expect(ruleView?.hasUnconfirmedSave).toBe(true)
      await createPageToolFiles(scope,{resume:true})
      expect(ruleView?.hasUnconfirmedSave).toBe(false)
      expect(upload).toHaveBeenCalledTimes(3)
      expect(files.size).toBe(3)
    }finally{scope.dataSet.destroy()}
  })

  it('deletes every listed basename one resource at a time and verifies an empty directory',async()=>{
    const files=new Map([['PAGE/rule.json','{}'],['PAGE/2__script.js','snapshot'],['PAGE/extra-template.txt','extra']])
    const remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    const scope=createScope(files,remove),save=vi.spyOn(scope.dataSet,'saveChanges')
    try{
      expect(await listPageToolFileNames(scope)).toEqual(['rule.json','2__script.js','extra-template.txt'])
      await deletePageToolFiles(scope)
      const fileCommits=save.mock.calls.flatMap(([request])=>request?.views??[]).filter(view=>view.tableName==='ProjectToolFile')
      expect(fileCommits).toHaveLength(3)
      expect(remove.mock.calls.map(([,pageId,name])=>`${pageId}/${name}`)).toEqual(['PAGE/rule.json','PAGE/2__script.js','PAGE/extra-template.txt'])
      expect(files.size).toBe(0)
      expect(scope.dataSet.getTable('PageToolFilesCommand')).toBeUndefined()
      expect(scope.dataSet.getTable('PageToolFilesDirectory')).toBeUndefined()
    }finally{scope.dataSet.destroy()}
  })

  it('keeps a confirmed first removal and resumes after a later explicit rejection',async()=>{
    const files=new Map([['PAGE/rule.json','{}'],['PAGE/script.js','script']]),remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    remove.mockImplementationOnce(async(_app,pageId,fileName)=>{files.delete(`${pageId}/${fileName}`)})
    remove.mockImplementationOnce(async()=>{throw new Error('explicit rejection')})
    const scope=createScope(files,remove)
    try{
      await expect(deletePageToolFiles(scope)).rejects.toThrow('explicit rejection')
      expect([...files.keys()]).toEqual(['PAGE/script.js'])
      await expect(deletePageToolFiles(scope)).resolves.toBeUndefined()
      expect([...files.keys()]).toEqual([])
      expect(remove).toHaveBeenCalledTimes(3)
    }finally{scope.dataSet.destroy()}
  })

  it('verifies an unknown accepted removal before continuing without replay',async()=>{
    const files=new Map([['PAGE/rule.json','{}']]),remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`);throw timeoutAfterAccept()})
    const scope=createScope(files,remove)
    try{
      await expect(deletePageToolFiles(scope)).rejects.toThrow('timeout after accept')
      await expect(deletePageToolFiles(scope)).resolves.toBeUndefined()
      expect(remove).toHaveBeenCalledOnce()
      expect(files.size).toBe(0)
    }finally{scope.dataSet.destroy()}
  })

  it('rejects an unsafe basename from the directory DataView before deleting anything',async()=>{
    const files=new Map([['PAGE/../outside','unsafe']]),remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    const scope=createScope(files,remove),save=vi.spyOn(scope.dataSet,'saveChanges')
    try{
      await expect(deletePageToolFiles(scope)).rejects.toThrow('PAGE_TOOL_FILE_DIRECTORY')
      expect(remove).not.toHaveBeenCalled()
      expect(save).not.toHaveBeenCalled()
      expect(files.size).toBe(1)
    }finally{scope.dataSet.destroy()}
  })

  it('fails closed when a listed non-text resource cannot be read as a FileResource baseline',async()=>{
    const files=new Map([['PAGE/image.bin','opaque']]),remove=vi.fn(async(_app:string,pageId:string,fileName:string)=>{files.delete(`${pageId}/${fileName}`)})
    const scope=createScope(files,remove),io=storage.io as ReturnType<typeof createPageToolFilesIo>,save=vi.spyOn(scope.dataSet,'saveChanges')
    vi.mocked(io.read).mockRejectedValueOnce(new Error('binary content cannot be decoded as text'))
    try{
      await expect(deletePageToolFiles(scope)).rejects.toThrow('binary content cannot be decoded as text')
      expect(remove).not.toHaveBeenCalled()
      expect(save).not.toHaveBeenCalled()
      expect(files.size).toBe(1)
    }finally{scope.dataSet.destroy()}
  })
})
