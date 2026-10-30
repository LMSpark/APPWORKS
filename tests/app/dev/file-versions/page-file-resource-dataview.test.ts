import {describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {ProjectToolResource} from '@spark-appworks/spark-project-model'
import appConfig from '../../../../config/pages/application/project-blueprint/pagedata.json'
import {createPageFileResourceView} from '@/services/project/page-tool-file-dataview'
import type {createPageToolFilesIo} from '@/lowcode/lowcode-runtime'

const storage=vi.hoisted(()=>({io:undefined as unknown}))
vi.mock('@/lowcode/lowcode-runtime',async importOriginal=>({...await importOriginal<typeof import('@/lowcode/lowcode-runtime')>(),createPageToolFilesIo:()=>storage.io}))

describe('formal ProjectToolFile DataView',()=>{
  it('stages create and delete against one page/file binding and confirms both source receipts',async()=>{
    const files=new Map<string,string>(),key='APP/PAGE/rule.json'
    const io={
      list:vi.fn(async()=>[]),
      read:vi.fn(async(_appId:string,_pageId:string,fileName:string)=>files.get(`APP/PAGE/${fileName}`)??null),
      upload:vi.fn(async(input:{appId:string;pageId:string;fileName:string;text:string})=>{files.set(`${input.appId}/${input.pageId}/${input.fileName}`,input.text)}),
      remove:vi.fn(async(_appId:string,_pageId:string,fileName:string)=>{files.delete(`APP/PAGE/${fileName}`)}),
      listVersions:vi.fn(async()=>[]),uploadVersion:vi.fn(async()=>{}),readVersion:vi.fn(async()=>null),
    } as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const dataSet=DataSet.fromJson({scenarioId:'7AB874097A1E8711A42FD845939A6E05',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      const view=createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:'rule.json',assertCurrent:()=>{}})
      expect(view.dataTable?.resourceId).toBe(ProjectToolResource.resources.ProjectToolFile)
      expect(view.queryContext).toMatchObject({pageId:'PAGE',fileName:'rule.json'})
      await view.refresh()
      expect(view.rows).toHaveLength(0)
      const added=await view.addRow({pageId:'PAGE',fileName:'rule.json',text:'{"rule":"ok"}'})
      expect('success' in added).toBe(false)
      const id=view.getPkKey(added as Record<string,unknown>)!
      expect((await dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]})).success).toBe(true)
      expect(files.get(key)).toBe('{"rule":"ok"}')
      expect(view.rows[0]).toMatchObject({pageId:'PAGE',fileName:'rule.json',text:'{"rule":"ok"}'})
      expect(await view.removeRow(id)).toBe(true)
      expect((await dataSet.saveChanges({views:[{tableName:'ProjectToolFile',viewId:view.viewId,ids:[id]}]})).success).toBe(true)
      expect(files.has(key)).toBe(false)
      expect(view.rows).toHaveLength(0)
      expect(io.upload).toHaveBeenCalledOnce()
      expect(io.remove).toHaveBeenCalledOnce()
    }finally{dataSet.destroy()}
  })

  it('does not reuse the named view when the app target changes',()=>{
    const dataSet=DataSet.fromJson({scenarioId:'7AB874097A1E8711A42FD845939A6E05',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:'rule.json',assertCurrent:()=>{}})
      expect(()=>createPageFileResourceView({dataSet,appId:'OTHER',pageId:'PAGE',fileName:'rule.json',assertCurrent:()=>{}}))
        .toThrow('FILE_RESOURCE_IDENTITY')
    }finally{dataSet.destroy()}
  })

  it('rejects a page or file context change before reading the new target',async()=>{
    const files=new Map<string,string>([['APP/PAGE/rule.json','baseline']]),read=vi.fn(async(appId:string,pageId:string,fileName:string)=>files.get(`${appId}/${pageId}/${fileName}`)??null)
    const io={list:vi.fn(async()=>[]),read,upload:vi.fn(async()=>{}),remove:vi.fn(async()=>{}),
      listVersions:vi.fn(async()=>[]),uploadVersion:vi.fn(async()=>{}),readVersion:vi.fn(async()=>null)} as unknown as ReturnType<typeof createPageToolFilesIo>
    storage.io=io
    const dataSet=DataSet.fromJson({scenarioId:'7AB874097A1E8711A42FD845939A6E05',tables:{ProjectToolFile:appConfig.tables.ProjectToolFile}})
    try{
      const view=createPageFileResourceView({dataSet,appId:'APP',pageId:'PAGE',fileName:'rule.json',assertCurrent:()=>{}})
      await view.refresh()
      expect(read).toHaveBeenCalledWith('APP','PAGE','rule.json')
      view.queryContext={...view.queryContext,pageId:'OTHER',fileName:'script.js'}
      await view.refresh()
      expect(read).toHaveBeenCalledTimes(1)
      expect(view.rows).toMatchObject([expect.objectContaining({pageId:'PAGE',fileName:'rule.json',text:'baseline'})])
    }finally{dataSet.destroy()}
  })
})
