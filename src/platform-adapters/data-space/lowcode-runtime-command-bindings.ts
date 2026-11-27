/**
 * @module app:lowcode/data-space/lowcode-runtime-command-bindings
 * 职责：汇集一次运行场景的命令 owner 工厂及缓存模型首次绑定所需适配。
 * 边界：资源身份用于定位。场景和许可约束仍由各领域工厂校验，实例状态仅存在于绑定后的 owner。
 * AI用途：定位场景声明与正式资源的装配入口，新增命令时在这里核对是否已有同资源工厂。
 */
import type {LowcodeDesignApi, LowcodeDesignFileUpload} from '@/platform-adapters/api'
import type {DataSpaceRuntimeApi} from '@spark-appworks/spark-data'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from './lowcode-data-space-assembler'
import {createCacheScenarioBindings} from '../resources/system/cache-management/runtime-bindings'
import {createApprovalCommandBindings} from '../resources/system/workflow/manage/flow-run-page/command/runtime-bindings'
import {createWorkflowScenarioBindings} from '../resources/structured-config/workflow-definition/execution/runtime-bindings'
import {createEnterpriseRegistrationBindings} from '../resources/system/enterprise-registration/runtime-bindings'
import {createApiInterfaceBindings} from '../resources/integration/api-management/runtime-bindings'
import {createAgentWorkflowCreationBindings} from '../resources/repository/agent-workflow/creation'
import {createAgentWorkflowPublicationBindings} from '../resources/repository/agent-workflow/publication'
import {createAgentWorkflowDeletionBindings} from '../resources/repository/agent-workflow/deletion'
import {createExcelCatalogBindings} from '../resources/semi-structured/excel-import/catalog/creation'
import {createPdfInspectionUploadBindings} from '../resources/semi-structured/pdf-inspect/upload-command'
import {createPdfInspectionInitBindings} from '../resources/semi-structured/pdf-inspect/init-command'

/** 由当前运行场景提供的装配输入，关联同一应用执行域和正式传输能力。 */
type RuntimeCommandBindingsInput = Readonly<{
 /** 本次场景的已解析声明，工厂据此检查所需的表和视图。 */
 config: ScenarioViewConfig
 /** 当前正式应用身份，用于限定应用文件及命令归属。 */
 applicationId: string
 /** 已绑定当前执行域的数据运行时，供缓存模型装配。 */
 runtime: DataSpaceRuntimeApi
 /** 宿主 HTTP 传输，领域 owner 按原合同派发。 */
 http: HttpClientBase
 /** 在正式派发前读取当前命令的请求作用域。 */
 readScope: Parameters<typeof createWorkflowScenarioBindings>[0]['readScope']
 /** 正式设计文件能力，供使用工具文件的命令复用。 */
 api: LowcodeDesignApi
 /** 保留原文件身份与回执的上传适配。 */
 fileUpload: LowcodeDesignFileUpload
 /** 当前场景或原执行域失效时抛错。 */
 assertCurrent: () => void
 /** 仅允许正式应用执行域注册 Excel 命令。 */
 allowExcelCommands: boolean
 /** 查询 PDF 初始化续办所需的当前业务归属。 */
 readOwner: Parameters<typeof createPdfInspectionInitBindings>[0]['readOwner']
 /** 取得 PDF 初始化原尝试记录使用的宿主存储。 */
 readStorage: Parameters<typeof createPdfInspectionInitBindings>[0]['readStorage']
}>

type CommandBindings = NonNullable<LowcodeDataSpaceAssemblerInput['commandBindings']>

/** 每次为当前配置建立独立注册表，重复的正式资源声明拒绝装配。 */
export function createRuntimeCommandBindings(input: RuntimeCommandBindingsInput) {
 const cache = createCacheScenarioBindings(input)
 const groups = [
  cache.commandBindings,
  createAgentWorkflowCreationBindings(input).commandBindings,
  createAgentWorkflowPublicationBindings(input).commandBindings,
  createAgentWorkflowDeletionBindings(input).commandBindings,
  createApprovalCommandBindings(input).commandBindings,
  createWorkflowScenarioBindings(input).commandBindings,
  input.allowExcelCommands ? createExcelCatalogBindings(input).commandBindings : undefined,
  createEnterpriseRegistrationBindings(input).commandBindings,
  createApiInterfaceBindings(input).commandBindings,
  createPdfInspectionUploadBindings(input),
  createPdfInspectionInitBindings(input),
 ]
 const bindings = new Map<string, CommandBindings[string]>()
 for (const group of groups) {
  for (const [resourceId, factory] of Object.entries(group ?? {})) {
   if (bindings.has(resourceId)) throw Error(`SCENARIO_COMMAND_RESOURCE: 命令资源重复注册 ${resourceId}`)
   bindings.set(resourceId, factory)
  }
 }
 return {commandBindings: Object.fromEntries(bindings), modelAdapters: cache.modelAdapters}
}
