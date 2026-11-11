import {File as NodeFile} from 'node:buffer'
import {DataSet} from '@spark-appworks/spark-data'
import type {LowcodeBinaryFileUploadReceipt} from '@spark-appworks/spark-lowcode-api'
import {FILE_DATA_COLUMNS, FILE_DATA_RESOURCE_ID, FILE_DATA_TABLE, FILE_DATA_VIEWS, FileDataResource} from '@/lowcode/resources/semi-structured/file-data/file-data-resource'

function fixture() {
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
  const dataSet = DataSet.fromJson({scenarioId: 'FILES', tables: {
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
