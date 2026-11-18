/**
 * @module app:lowcode/resources/semi-structured/pdf-inspect/init-command
 * 职责：在同一 DataSet 核实上传回执并暂存原任务命令。
 * 边界：由原命令适配记录恢复定位、区分首次派发与未知回查，页面只按原行保存。
 * AI用途：以正式配置和已确认文件发起核验，保留原请求身份。
 */
import {PdfInspectionApi, PdfInspectionInitResource, PdfInspectionRecoveryJournal} from '@spark-appworks/spark-lowcode-api'
import type {PdfInspectionRecoveryOwner, PdfInspectionRecoveryStorage} from '@spark-appworks/spark-lowcode-api'
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {capturePdfInspectionUpload} from './upload-command'
import {PDF_INSPECTION_SCENARIO_ID} from './runtime-bindings'

export const PDF_INSPECTION_INIT_TABLE = 'PdfInspectionInit'

/** 正式请求只能使用同一实例的原配置和已核对的上传编号。 */
type InitInput = Readonly<{configId: string; uploadIds: readonly string[]; assertRule: () => void;
  resolveRecoveryUrl: (requestId: string) => string}>
/** 初始化适配与当前命令视图，只暂存一次原输入许可。 */
type Binding = {view: DataView; resource: PdfInspectionInitResource; pending?: InitInput; activeId?: string; staging: boolean}
/** 正式场景和当前认证域提供初始化及恢复存储。 */
type Options = ConstructorParameters<typeof PdfInspectionApi>[0] & Readonly<{
  config: ScenarioViewConfig; assertCurrent: () => void; readOwner: () => PdfInspectionRecoveryOwner;
  readStorage: () => PdfInspectionRecoveryStorage
}>

const bindings = new WeakMap<DataSet, Binding>()

/** 只为正式场景中身份匹配的命令声明注册原适配。 */
export function createPdfInspectionInitBindings(input: Options): NonNullable<LowcodeDataSpaceAssemblerInput['commandBindings']> {
  if (input.config.scenarioId !== PDF_INSPECTION_SCENARIO_ID) return {}
  const tables = input.config.toJSON()['tables']
  if (!isRecord(tables) || !Object.hasOwn(tables, PDF_INSPECTION_INIT_TABLE)) return {}
  const table = tables[PDF_INSPECTION_INIT_TABLE]
  if (!isRecord(table) || table['resourceType'] !== 'command' || table['resourceId'] !== PdfInspectionInitResource.resourceId ||
    Object.hasOwn(table, 'modelBinding')) throw Error('PDF_INSPECTION_INIT_BINDING: 正式命令声明不匹配')
  return {[PDF_INSPECTION_INIT_TABLE]: view => bindInit(view, input)}
}

function bindInit(view: DataView, input: Options) {
  const dataSet = view.dataSet
  if (dataSet?.scenarioId !== PDF_INSPECTION_SCENARIO_ID || view.viewId !== 'default' || bindings.has(dataSet)) {
    throw Error('PDF_INSPECTION_INIT_BINDING: 原命令实例不匹配')
  }
  let journal: PdfInspectionRecoveryJournal | undefined
  const currentJournal = () => {
    input.assertCurrent()
    if (!journal) throw Error('PDF_INSPECTION_INIT_RECOVERY: 缺少原恢复定位')
    return journal
  }
  const resource = new PdfInspectionInitResource({
    api: new PdfInspectionApi(input), assertCurrent: input.assertCurrent,
    recovery: {
      begin: requestId => {
        const pointer = currentJournal().begin(requestId)
        binding.activeId = requestId
        return pointer
      },
      assertCurrent: pointer => currentJournal().assertCurrent(pointer),
      settle: pointer => currentJournal().settle(pointer),
    },
    prepare: (command, row) => {
      const pending = binding.pending, requestId = row['requestId']
      if (command !== view || !pending || typeof requestId !== 'string') throw Error('PDF_INSPECTION_INIT_CAPTURE: 缺少原请求许可')
      delete binding.pending
      const uploads = pending.uploadIds.map(id => capturePdfInspectionUpload(dataSet, id))
      const assertReady = () => {pending.assertRule(); for (const upload of uploads) upload.assertCurrent()}
      assertReady()
      journal = new PdfInspectionRecoveryJournal({storage: input.readStorage(), owner: input.readOwner(), resolveUrl: pending.resolveRecoveryUrl})
      return {input: {requestId, configId: pending.configId, files: uploads.map(upload => upload.input)}, assertReady}
    },
  })
  const binding: Binding = {resource, view, staging: false}
  const result = resource.binding(view)
  bindings.set(dataSet, binding)
  return result
}

/** 只暂存原任务行；只有 DataSet 保存该行才会派发。 */
export async function stagePdfInspectionTask(dataSet: DataSet, input: InitInput): Promise<string> {
  const binding = bindings.get(dataSet)
  if (!binding || binding.staging || binding.activeId !== undefined || binding.view.mutating || binding.view.hasUnconfirmedSave ||
    binding.view.dirtyTracking.hasPendingChanges() || !input.uploadIds.length || new Set(input.uploadIds).size !== input.uploadIds.length) {
    throw Error('PDF_INSPECTION_INIT_CAPTURE: 原命令未就绪或文件身份不唯一')
  }
  input.assertRule()
  const uploadIds = [...input.uploadIds]
  const files = uploadIds.map(id => capturePdfInspectionUpload(dataSet, id).input)
  binding.staging = true
  binding.pending = {...input, uploadIds}
  try {
    const row = await binding.view.addRow({configId: input.configId, files})
    const id = binding.view.getPkKey(row)
    if (typeof id !== 'string') throw Error('PDF_INSPECTION_INIT_CAPTURE: 原请求缺少身份')
    return id
  } finally {delete binding.pending; binding.staging = false}
}

/** 只在原 DataSet 接纳可读回执后清理恢复定位。 */
export function settlePdfInspectionTask(dataSet: DataSet, requestId: string): void {
  const binding = bindings.get(dataSet)
  if (binding?.activeId !== requestId) throw Error('PDF_INSPECTION_INIT_BINDING: 原命令未绑定')
  binding.resource.settleConfirmed(binding.view, requestId)
  delete binding.activeId
}
