/**
 * @module app:lowcode/resources/semi-structured/file-data/file-data-resource
 * 职责：把正式 filedata 文件区根目录作为数据空间文件资源，提供目录查询、上传新增与删除。
 * 边界：只用既有 /api/File 合同（list/UploadFile/DownFile/RemoveFile），上传须ACK定位并核原字节，删除须回列确认；不承诺多文件事务。
 * AI用途：文件管理页通过同一 DataView 查询、新增(content携带原File)与删除时，定位本资源及其保存语义。
 */
import {DataViewLocalQuery, type DataColumn, type DataRow, type DataView, type QueryParams} from '@spark-appworks/spark-data'
import type {LowcodeBinaryFileUploadReceipt, LowcodeDesignApi, LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'

export const FILE_DATA_TABLE = 'FileDataCatalog'
export const FILE_DATA_RESOURCE_ID = 'semi-structured:file-data'
/** content 仅供新增行携带用户本次选择的原 File；目录查询不返回文件内容。 */
export const FILE_DATA_COLUMNS: readonly DataColumn[] = Object.freeze([
  {name: 'fileName', label: '文件名称', type: 'string', isPrimaryKey: true},
  {name: 'path', label: '存储路径', type: 'string'},
  {name: 'lastModified', label: '上传时间', type: 'string'},
  {name: 'content', label: '文件内容', type: 'object'},
])
export const FILE_DATA_VIEWS = Object.freeze({default: Object.freeze({
  autoLoad: false,
  autoCurrentFirst: false,
  autoSelectFirst: false,
  commitMode: 'staged',
}), download: Object.freeze({autoLoad:false,commitMode:'staged',queryContext:Object.freeze({fileName:''})})})
export const FILE_DATA_QUERY_PARAMETERS = Object.freeze({
  default:Object.freeze([]),
  download:Object.freeze([{name:'fileName',type:'string',label:'文件名称',required:true}]),
})

const AREA = Object.freeze({appType: 'filedata' as const, customPath: '' as const})
const OUTPUT: ReadonlySet<string> = new Set(['fileName', 'path', 'lastModified'])

type Executor = Parameters<DataView['bindQueryExecutor']>[0]
type QueryResult = Awaited<ReturnType<Executor['executeQuery']>>
type SaveCommand = Parameters<NonNullable<Executor['save']>>[0]
type SaveReceipt = Awaited<ReturnType<NonNullable<Executor['save']>>>[number]
/** 文件区执行器依赖：目录/删除接口、二进制上传核验链及会话校验。 */
type FileDataResourceInput = Readonly<{
  api: Pick<LowcodeDesignApi, 'listFiles' | 'removeFile' | 'readFileBytes'>
  fileUpload: Pick<LowcodeDesignFileUpload, 'uploadBinaryVersion' | 'verifyBinaryVersion'>
  assertCurrent: () => void
}>

function uploadTime(ms: number | null): string | null {
  if (ms === null) return null
  const d = new Date(ms), pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function fileDataError(message: string): Error {return new Error(`FILE_DATA_SAVE: ${message}`)}

type PendingFileMutation =
  | {kind:'delete'; fileName:string}
  | {kind:'upload'; file:File; receipt?:LowcodeBinaryFileUploadReceipt}

/** filedata 根目录文件资源；每个查询结果绑定原视图，保存只接纳同视图捕获的新增与删除。 */
export class FileDataResource {
  readonly #input: FileDataResourceInput
  readonly #views = new WeakMap<object, DataView>()
  readonly #pending = new WeakMap<object, PendingFileMutation>()

  constructor(input: FileDataResourceInput) {this.#input = input}

  async executeQuery(view: DataView, params: QueryParams): Promise<QueryResult> {
    this.assertView(view)
    if (view.viewId === 'download') return this.readDownload(view)
    const rows = await this.readDirectory()
    this.assertView(view)
    const selected = DataViewLocalQuery.select({rows, fields: OUTPUT, primaryKeys: ['fileName'], params})
    return this.result(view, selected.rows, selected.total)
  }

  async save(command: SaveCommand): Promise<SaveReceipt[]> {
    this.#input.assertCurrent()
    const change = command.changes.length === 1 ? command.changes[0] : undefined
    const view = change ? this.#views.get(change.context) : undefined
    if (!change || !view) throw fileDataError('保存须且只能对应一个原文件目录查询')
    this.assertView(view)
    if (change.identity.scenarioId !== view.dataSet?.scenarioId || change.identity.metaName !== FILE_DATA_TABLE) throw fileDataError('保存身份与原视图不一致')
    if (change.changes.changed?.length) throw fileDataError('文件只能上传或删除，不能修改')
    const added = change.changes.added ?? [], deleted = change.changes.deleted ?? []
    if (added.length + deleted.length !== 1) throw fileDataError('每次只能上传或删除一个文件')
    let pending = this.#pending.get(change.context)
    if (!pending) {
      const removed = deleted[0]
      if (removed) {
        const fileName = String(removed['fileName'] ?? '')
        if (!change.context.rows.some(row => row['fileName'] === fileName)) throw fileDataError('删除目标不属于原目录查询')
        pending = {kind:'delete',fileName}
        this.#pending.set(change.context,pending)
        await this.#input.api.removeFile({...AREA,fileName})
      } else {
        const file = added[0]?.['content']
        if (!(file instanceof File)) throw fileDataError('新增文件缺少本次选择的原File')
        const upload: PendingFileMutation = {kind:'upload',file}
        upload.receipt = await this.#input.fileUpload.uploadBinaryVersion({...AREA,file,scenarioId:change.identity.scenarioId,fieldName:'files',
          assertReady:()=>{this.assertView(view);this.#pending.set(change.context,upload)}})
        this.#pending.set(change.context,upload)
        pending = upload
      }
    }
    this.assertView(view)
    let uploaded: string | undefined
    if (pending.kind === 'upload') {
      if (!pending.receipt) throw fileDataError('原上传缺少正式文件定位，结果尚未确认')
      await this.#input.fileUpload.verifyBinaryVersion({receipt:pending.receipt,file:pending.file})
      this.assertView(view)
      uploaded = pending.receipt.locator.fileName
    }
    const rows = await this.readDirectory()
    this.assertView(view)
    const surviving = pending.kind === 'delete' ? rows.find(row => row['fileName'] === pending.fileName) : undefined
    if (surviving !== undefined) {
      throw fileDataError(`${String(surviving['fileName'])} 删除后仍出现在目录中`)
    }
    const accepted = uploaded === undefined ? [] : rows.filter(row => row['fileName'] === uploaded)
    if (uploaded !== undefined && accepted.length !== 1) {
      throw fileDataError(`${uploaded} 上传后未出现在目录中`)
    }
    return [{metaName: FILE_DATA_TABLE, added: accepted, changed: [], deleted: [...deleted], changedFields: [],
      context: this.result(view, rows, rows.length)}]
  }

  hasUnconfirmedSave(context: QueryResult): boolean {return this.#pending.has(context)}
  acknowledgeSave(context: QueryResult): undefined {this.#pending.delete(context);return undefined}

  private async readDownload(view: DataView): Promise<QueryResult> {
    const directory = view.dataSet?.getView(FILE_DATA_TABLE, 'default')
    const fileName = view.queryContext['fileName']
    if (typeof fileName !== 'string' || fileName.length === 0) {
      throw new Error('文件下载目标不在当前正式目录')
    }
    const row = directory?.rows.find(item => item['fileName'] === fileName)
    if (directory?.rows === undefined || row?.['path'] !== `${AREA.appType}/${fileName}`) {
      throw new Error('文件下载目标不在当前正式目录')
    }
    const assertOriginal = directory.captureReadRow(row, ['fileName', 'path'])
    const bytes = await this.#input.api.readFileBytes({...AREA, fileName})
    this.assertView(view)
    assertOriginal()
    if (view.queryContext['fileName'] !== fileName) throw new Error('文件下载目标已变化')
    return this.result(view, [{fileName, path: row['path'], content: bytes}], 1)
  }

  private async readDirectory(): Promise<DataRow[]> {
    this.#input.assertCurrent()
    const entries = await this.#input.api.listFiles({appType: AREA.appType, folderPath: AREA.customPath})
    this.#input.assertCurrent()
    return entries.map(entry => ({fileName: entry.name, path: `${AREA.appType}/${entry.name}`, lastModified: uploadTime(entry.lastModified)}))
  }

  private result(view: DataView, rows: readonly DataRow[], total: number): QueryResult {
    const keys = new Set(rows.map(row => String(row['fileName'])))
    const check = () => this.assertView(view)
    const download = view.viewId === 'download'
    const readable = (field: string) => OUTPUT.has(field) || download && field === 'content'
    const result: QueryResult = {
      rows,
      total,
      rowKey: row => row['fileName'],
      assertIdentity: identity => {
        check()
        if (identity.scenarioId !== view.dataSet?.scenarioId || identity.metaName !== FILE_DATA_TABLE
          || identity.resource?.resourceType !== 'file' || identity.resource.resourceId !== FILE_DATA_RESOURCE_ID) {
          throw new Error('FILE_DATA_IDENTITY: 视图资源身份不匹配')
        }
      },
      fieldAccess: (rowKey, field) => {
        check()
        const visible = keys.has(String(rowKey)) && readable(field)
        return {read: visible ? 'visible' as const : 'invisible' as const, write: 'denied' as const,
          component: visible ? 'readonly' as const : 'hidden' as const, required: false, writeMode: 'readonly' as const}
      },
      readFieldAccess: (row, field) => {check(); return rows.includes(row) && readable(field) ? 'visible' as const : 'invisible' as const},
      prepareNewRow: row => {
        check()
        const file = row['content']
        if (!(file instanceof File) || !file.name) throw fileDataError('新增文件须携带本次选择的原File')
        const pending = keys.has(file.name) ? `${file.name}（待上传）` : file.name
        return {fileName: pending, path: `${AREA.appType}/${file.name}`, lastModified: null, content: file}
      },
      newRowFieldAccess: field => ({read: field === 'content' || OUTPUT.has(field) ? 'visible' as const : 'invisible' as const,
        write: field === 'content' ? 'allowed' as const : 'denied' as const, required: field === 'content'}),
      addActionState: () => {check(); return download ? 'disabled' as const : 'enabled' as const},
      editActionState: () => {check(); return 'disabled' as const},
      deleteActionState: rowKey => {check(); return !download && keys.has(String(rowKey)) ? 'enabled' as const : 'disabled' as const},
      createChildActionState: () => {check(); return 'disabled' as const},
      viewActionState: rowKey => {check(); return keys.has(String(rowKey)) ? 'enabled' as const : 'disabled' as const},
    }
    if (!download) this.#views.set(result, view)
    return result
  }

  private assertView(view: DataView): void {
    this.#input.assertCurrent()
    if (view.destroyed || view.dataSet?.destroyed || view.dataTable?.tableName !== FILE_DATA_TABLE
      || view.dataTable.resourceType !== 'file' || view.dataTable.resourceId !== FILE_DATA_RESOURCE_ID
      || view.dataTable.modelBinding) throw new Error('FILE_DATA_IDENTITY: 正式文件资源未绑定')
  }
}
