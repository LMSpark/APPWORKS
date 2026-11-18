import {File as NodeFile} from 'node:buffer'
import {DataSet} from '@spark-appworks/spark-data'
import type {LowcodeBinaryFileUploadReceipt} from '@spark-appworks/spark-lowcode-api'
import {FILE_DATA_COLUMNS, FILE_DATA_RESOURCE_ID, FILE_DATA_TABLE, FILE_DATA_VIEWS, FileDataResource} from '@/lowcode/resources/semi-structured/file-data/file-data-resource'

import {config,flushPromises,mount} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import {RendererTable,Spark,SparkPageRenderer,registerAllRenderers} from '@spark-appworks/spark-component'
import FileManager from '@/views/FileDataManager/FileManager/index.vue'
import {provideTestPageService} from '../../../support/helpers/page-service-host'
import configText from '../../../../config/pages/semi-structured/file-manager/pagedata.json?raw'

const runtimeSource=vi.hoisted(()=>({dataSet:undefined as DataSet|undefined}))
vi.mock('@/lowcode/data-space/lowcode-data-space-runtime',()=>({
  loadLowcodeRuntimeScenario:vi.fn(async()=>runtimeSource.dataSet),
}))

vi.mock('@spark-appworks/spark-app',async importOriginal=>({
  ...await importOriginal<typeof import('@spark-appworks/spark-app')>(),
  useSystemPageDirtySource:vi.fn(),
}))
function fixture(formalDataSet?:DataSet) {
  const names = ['a.txt']
  const api = {
    readFileBytes: vi.fn(async () => new Uint8Array([0,255,42])),
    listFiles: vi.fn(async (input: {appType: string; folderPath: string}) => {
      expect(input).toEqual({appType: 'filedata', folderPath: ''})
      return names.map((name, index) => ({name, lastModified: 1769848151208 + index}))
    }),
    removeFile: vi.fn(async (input: {appType: string; customPath: string; fileName: string}) => {
      expect(input).toMatchObject({appType: 'filedata', customPath: ''})
      names.splice(names.indexOf(input.fileName), 1)
    }),
  }
  const fileUpload = {
    uploadBinaryVersion: vi.fn(async (command: {file: File; scenarioId: string; fieldName: string; appType: string; customPath: string; assertReady?:()=>void}) => {
      command.assertReady?.()
      expect(command).toMatchObject({appType: 'filedata', customPath: '', fieldName: 'files', scenarioId: 'FILES'})
      names.push(command.file.name)
      const receipt: LowcodeBinaryFileUploadReceipt = {templatePath: `/NewApp/${command.file.name}`,
        locator: {appType: 'filedata', customPath: '', fileName: command.file.name, isCrossEnterprise: false}}
      return receipt
    }),
    verifyBinaryVersion: vi.fn(async () => undefined),
  }
  const dataSet = formalDataSet ?? DataSet.fromJson({scenarioId: 'FILES', tables: {
    [FILE_DATA_TABLE]: {resourceType: 'file', resourceId: FILE_DATA_RESOURCE_ID, columns: [...FILE_DATA_COLUMNS], views: FILE_DATA_VIEWS},
  }})
  const resource = new FileDataResource({api, fileUpload, assertCurrent: () => undefined})
  const view = dataSet.getView(FILE_DATA_TABLE, 'default')!
  for(const item of dataSet.getTable(FILE_DATA_TABLE)!.viewList)item.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: FILE_DATA_RESOURCE_ID}})
  return {api, fileUpload, dataSet, view}
}

// jsdom File 经 Node structuredClone 会丢失原型；浏览器结构化克隆保留 File，测试改用可克隆的原生 File。
beforeEach(() => {vi.stubGlobal('File', NodeFile)})
afterEach(() => {vi.unstubAllGlobals()})

describe('filedata DataView resource', () => {
  it('lists the filedata root as read-only rows', async () => {
    const {api, dataSet, view} = fixture()
    try {
      expect((await view.requestRefresh()).success).toBe(true)
      expect(view.rows).toMatchObject([{fileName: 'a.txt', path: 'filedata/a.txt'}])
      expect(String(view.rows[0]!['lastModified'])).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      expect(view.fieldAccess(view.rows[0]!, 'fileName')).toMatchObject({read: 'visible', write: 'denied'})
      expect(()=>view.captureReadRow(view.rows[0]!, ['fileName','path'])()).not.toThrow()
      expect(api.listFiles).toHaveBeenCalledOnce()
    } finally {dataSet.destroy()}
  })

  it('reads exact download bytes only for the current formal directory row', async()=>{
    const {api,dataSet,view}=fixture()
    try{
      await view.refresh()
      const download=dataSet.getView(FILE_DATA_TABLE,'download')!
      download.queryContext={fileName:'missing.txt'}
      await download.refresh()
      expect(download.loadingError?.message).toContain('当前正式目录')
      expect(api.readFileBytes).not.toHaveBeenCalled()
      download.queryContext={fileName:'a.txt'}
      await download.refresh()
      const bytes=download.readSnapshot().rows[0]?.['content'] as Uint8Array
      expect(ArrayBuffer.isView(bytes)).toBe(true)
      expect(Array.from(bytes)).toEqual([0,255,42])
      expect(api.readFileBytes).toHaveBeenCalledWith({appType:'filedata',customPath:'',fileName:'a.txt'})
    }finally{dataSet.destroy()}
  })

  it('uploads the picked File, verifies its bytes and accepts the listed row', async () => {
    const {fileUpload, dataSet, view} = fixture()
    try {
      await view.requestRefresh()
      const file = new File(['smoke'], 'b.txt', {type: 'text/plain'})
      await view.addRow({content: file})
      const result = await view.saveChanges()
      expect(result.success).toBe(true)
      expect(fileUpload.uploadBinaryVersion).toHaveBeenCalledOnce()
      expect(fileUpload.verifyBinaryVersion).toHaveBeenCalledOnce()
      await view.refresh()
      expect(view.rows.map(row => row['fileName'])).toEqual(['a.txt', 'b.txt'])
    } finally {dataSet.destroy()}
  })

  it('does not issue a success receipt while the target is still present after RemoveFile', async () => {
    const {api, dataSet, view} = fixture()
    try {
      api.removeFile.mockResolvedValueOnce(undefined)
      await view.requestRefresh()
      await view.removeRow('a.txt')
      await expect(view.saveChanges()).rejects.toThrow('删除后仍出现在目录中')
      expect(view.hasUnconfirmedSave).toBe(true)
      await expect(view.saveChanges()).rejects.toThrow('删除后仍出现在目录中')
      expect(api.removeFile).toHaveBeenCalledOnce()
      expect(api.listFiles).toHaveBeenCalledTimes(3)
    } finally {dataSet.destroy()}
  })

  it('recovers the original uploaded bytes after ACK without another upload',async()=>{
    const {fileUpload,dataSet,view}=fixture()
    try{
      fileUpload.verifyBinaryVersion.mockRejectedValueOnce(new Error('read unavailable'))
      await view.refresh()
      await view.addRow({content:new File(['sample'],'b.txt')})
      await expect(view.saveChanges()).rejects.toThrow('read unavailable')
      expect(view.hasUnconfirmedSave).toBe(true)
      expect((await view.saveChanges()).success).toBe(true)
      expect(fileUpload.uploadBinaryVersion).toHaveBeenCalledOnce()
      expect(fileUpload.verifyBinaryVersion).toHaveBeenCalledTimes(2)
      expect(view.hasUnconfirmedSave).toBe(false)
    }finally{dataSet.destroy()}
  })

  it('holds an upload without its original ACK and never retries or guesses the filename',async()=>{
    const {api,fileUpload,dataSet,view}=fixture()
    try{
      fileUpload.uploadBinaryVersion.mockImplementationOnce(async command=>{
        command.assertReady?.()
        throw new Error('ACK lost')
      })
      await view.refresh()
      await view.addRow({content:new File(['sample'],'b.txt')})
      await expect(view.saveChanges()).rejects.toThrow('ACK lost')
      expect(view.hasUnconfirmedSave).toBe(true)
      await expect(view.saveChanges()).rejects.toThrow('缺少正式文件定位')
      expect(fileUpload.uploadBinaryVersion).toHaveBeenCalledOnce()
      expect(fileUpload.verifyBinaryVersion).not.toHaveBeenCalled()
      expect(api.listFiles).toHaveBeenCalledOnce()
    }finally{dataSet.destroy()}
  })

  it('deletes a listed file through RemoveFile', async () => {
    const {api, dataSet, view} = fixture()
    try {
      await view.requestRefresh()
      await view.removeRow('a.txt')
      expect((await view.saveChanges()).success).toBe(true)
      expect(api.removeFile).toHaveBeenCalledWith({appType: 'filedata', customPath: '', fileName: 'a.txt'})
      await view.refresh()
      expect(view.rows).toEqual([])
    } finally {dataSet.destroy()}
  })
})

it('consumes the file catalog tool and verifies the original row again after confirming deletion', async()=>{
  const formal=DataSet.fromJson(JSON.parse(configText))
  const {dataSet,view,api}=fixture(formal)
  runtimeSource.dataSet=dataSet
  registerAllRenderers()
  const stubs=config.global.stubs
  const activeStubs={...stubs}
  for(const key of ['SparkComponentRenderer','spark-component-renderer','el-table','el-table-column'])delete activeStubs[key]
  config.global.stubs=activeStubs
  const nodeId='EDF7DE3E5723E127F98B2A119BE81BF9'
  const router=createRouter({history:createMemoryHistory(),routes:[
    {path:'/apps/app/file',component:FileManager,meta:{nodeId,blueprintScenarioId:nodeId,systemPageIdentityState:'resolved'}},
  ]})
  await router.push('/apps/app/file')
  let confirm:((value:boolean)=>void)|undefined
  const wrapper=mount(defineComponent({setup(){
    const service=provideTestPageService(router)
    service.showConfirm=()=>new Promise(resolve=>{confirm=resolve})
    return()=>h(RouterView)
  }}),{global:{plugins:[router,ElementPlus,Spark.createPlugin()]}})
  try{
    await vi.waitFor(()=>expect(wrapper.findComponent(SparkPageRenderer).exists()).toBe(true))
    expect(wrapper.getComponent(SparkPageRenderer).props('pageRuntime')?.getDataSet(formal.scenarioId!)).toBe(dataSet)
    const remove=()=>wrapper.getComponent(RendererTable).get('tbody tr').findAll('button').find(button=>button.text()==='删除')!
    await vi.waitFor(()=>expect(remove().text()).toBe('删除'))
    const createObjectURL=vi.fn((_blob:Blob)=>'blob:file-download-test')
    const revokeObjectURL=vi.fn()
    const browserURL=URL
    vi.stubGlobal('URL',class extends browserURL {
      static override createObjectURL=createObjectURL
      static override revokeObjectURL=revokeObjectURL
    })
    const clicked:HTMLAnchorElement[]=[]
    const browserClick=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){clicked.push(this)})
    try{
      const buttons=()=>wrapper.getComponent(RendererTable).get('tbody tr').findAll('button')
      await buttons().find(button=>button.text()==='下载')!.trigger('click')
      await vi.waitFor(()=>expect(clicked).toHaveLength(1))
      expect(clicked[0]?.download).toBe('a.txt')
      expect(clicked[0]?.href).toBe('blob:file-download-test')
      const blob=createObjectURL.mock.calls[0]![0]
      const bytes=await new Promise<ArrayBuffer>((resolve,reject)=>{
        const reader=new FileReader()
        reader.onload=()=>resolve(reader.result as ArrayBuffer)
        reader.onerror=()=>reject(reader.error)
        reader.readAsArrayBuffer(blob)
      })
      expect(Array.from(new Uint8Array(bytes))).toEqual([0,255,42])
      expect(api.readFileBytes).toHaveBeenCalledOnce()
      await vi.waitFor(()=>expect(revokeObjectURL).toHaveBeenCalledWith('blob:file-download-test'),{timeout:2000})
    }finally{browserClick.mockRestore()}
    await remove().trigger('click')
    expect(confirm).toBeDefined()
    await view.refresh()
    confirm!(true)
    await flushPromises()
    expect(api.removeFile).not.toHaveBeenCalled()
    confirm=undefined
    const deleteOriginal=api.removeFile.getMockImplementation()!
    api.removeFile.mockImplementationOnce(async input=>{
      await deleteOriginal(input)
      throw new Error('receipt lost')
    })
    await remove().trigger('click')
    expect(confirm).toBeDefined()
    confirm!(true)
    await vi.waitFor(()=>expect(api.removeFile).toHaveBeenCalledOnce())
    await vi.waitFor(()=>expect(view.hasUnconfirmedSave).toBe(true))
    const verify=()=>wrapper.findAll('button').find(button=>button.text()==='核验原文件操作')
    await vi.waitFor(()=>expect(verify()).toBeDefined())
    await verify()!.trigger('click')
    await vi.waitFor(()=>expect(view.hasUnconfirmedSave).toBe(false))
    expect(view.rows).toEqual([])
    expect(api.removeFile).toHaveBeenCalledOnce()
  }finally{
    wrapper.unmount()
    config.global.stubs=stubs
    runtimeSource.dataSet=undefined
    if(!dataSet.destroyed)dataSet.destroy()
  }
})
