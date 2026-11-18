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

function fixture(formalDataSet?:DataSet) {
  const names = ['a.txt']
  const api = {
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
    uploadBinaryVersion: vi.fn(async (command: {file: File; scenarioId: string; fieldName: string; appType: string; customPath: string}) => {
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
  view.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: FILE_DATA_RESOURCE_ID}})
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
      expect(api.removeFile).toHaveBeenCalledOnce()
      expect(api.listFiles).toHaveBeenCalledTimes(2)
    } finally {dataSet.destroy()}
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
    const remove=()=>wrapper.getComponent(RendererTable).get('tbody tr').get('button')
    await vi.waitFor(()=>expect(remove().text()).toBe('删除'))
    await remove().trigger('click')
    expect(confirm).toBeDefined()
    await view.refresh()
    confirm!(true)
    await flushPromises()
    expect(api.removeFile).not.toHaveBeenCalled()
    confirm=undefined
    await remove().trigger('click')
    expect(confirm).toBeDefined()
    confirm!(true)
    await vi.waitFor(()=>expect(api.removeFile).toHaveBeenCalledOnce())
    await vi.waitFor(()=>expect(view.rows).toEqual([]))
  }finally{
    wrapper.unmount()
    config.global.stubs=stubs
    runtimeSource.dataSet=undefined
    if(!dataSet.destroyed)dataSet.destroy()
  }
})
