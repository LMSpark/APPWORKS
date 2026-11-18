/**
 * @module app:lowcode/resources/semi-structured/pdf-inspect/upload-command
 * 职责：把当前用户选择的原 File 暂存到正式 PDF 上传命令。
 * 边界：只有原 DataSet 保存会派发上传；原文件和回执由资源适配保留。
 * AI用途：沿正式命令暂存文件，或读取已验证字节的上传输入证明。
 */
import {LowcodeDesignFileUpload, PdfInspectionUploadResource} from '@spark-appworks/spark-lowcode-api'
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {PDF_INSPECTION_SCENARIO_ID} from './runtime-bindings'

export const PDF_INSPECTION_UPLOAD_TABLE = 'PdfInspectionUpload'

/** 本次 DataSet 持有上传资源与短暂的输入许可。 */
type UploadBinding = {
  readonly resource: PdfInspectionUploadResource
  readonly view: DataView
  staging: boolean
  pending?: Readonly<{file: File; assertReady: () => void}>
}

const bindings = new WeakMap<DataSet, UploadBinding>()

/** 只为已声明的正式上传表提供资源绑定。 */
export function createPdfInspectionUploadBindings(input: ConstructorParameters<typeof LowcodeDesignFileUpload>[0] & Readonly<{
  config: ScenarioViewConfig; assertCurrent: () => void
}>): NonNullable<LowcodeDataSpaceAssemblerInput['commandBindings']> {
  if (input.config.scenarioId !== PDF_INSPECTION_SCENARIO_ID) return {}
  const tables = input.config.toJSON()['tables']
  if (!isRecord(tables) || !Object.hasOwn(tables, PDF_INSPECTION_UPLOAD_TABLE)) return {}
  const declared = tables[PDF_INSPECTION_UPLOAD_TABLE]
  if (!isRecord(declared) || declared['resourceType'] !== 'command' ||
    declared['resourceId'] !== PdfInspectionUploadResource.resourceId || Object.hasOwn(declared, 'modelBinding')) {
    throw Error('PDF_UPLOAD_BINDING: 正式上传资源声明不匹配')
  }
  return {[PDF_INSPECTION_UPLOAD_TABLE]: view => bindPdfInspectionUpload(view, input)}
}

/** 首次正式装配绑定原视图，由 SDK 执行单次派发及回执核验。 */
function bindPdfInspectionUpload(view: DataView, input: ConstructorParameters<typeof LowcodeDesignFileUpload>[0] & Readonly<{
  assertCurrent: () => void
}>) {
  const dataSet = view.dataSet
  if (dataSet?.scenarioId !== PDF_INSPECTION_SCENARIO_ID || view.tableName !== PDF_INSPECTION_UPLOAD_TABLE ||
    view.viewId !== 'default' || bindings.has(dataSet)) throw Error('PDF_UPLOAD_BINDING: 原场景或命令视图不匹配')
  const resource = new PdfInspectionUploadResource({
    upload: new LowcodeDesignFileUpload(input), assertCurrent: input.assertCurrent,
    prepare: command => {
      const pending = binding.pending
      if (!pending || command !== view) throw Error('PDF_UPLOAD_CAPTURE: 缺少本次原文件许可')
      delete binding.pending
      return {...pending, scenarioId: PDF_INSPECTION_SCENARIO_ID}
    },
  })
  const binding: UploadBinding = {resource, view, staging: false}
  const options = resource.binding(view)
  bindings.set(dataSet, binding)
  return options
}

/** 只暂存单个原文件。业务调用须在同一数据集验证规则及本批服务限制。 */
export async function stagePdfInspectionFile(dataSet: DataSet, file: File, assertReady: () => void): Promise<string> {
  const binding = bindings.get(dataSet)
  if (!binding || binding.staging || binding.view.mutating || binding.view.hasUnconfirmedSave) {
    throw Error('PDF_UPLOAD_CAPTURE: 上传命令未就绪或仍有未确认操作')
  }
  assertReady()
  binding.staging = true
  binding.pending = {file, assertReady}
  try {
    const row = await binding.view.addRow({originalName: file.name, size: file.size})
    const id = binding.view.getPkKey(row)
    if (typeof id !== 'string') throw Error('PDF_UPLOAD_CAPTURE: 原上传命令缺少身份')
    return id
  } finally {delete binding.pending; binding.staging = false}
}

/** 任务初始化只消费已确认的原上传回执。 */
export function capturePdfInspectionUpload(dataSet: DataSet, uploadId: string) {
  const binding = bindings.get(dataSet)
  if (!binding) throw Error('PDF_UPLOAD_ACK: 原上传视图未绑定')
  return binding.resource.fileInput(binding.view, uploadId)
}
