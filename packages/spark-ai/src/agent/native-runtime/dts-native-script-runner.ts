/**
 * @module @spark-appworks/spark-ai:agent/native-runtime/dts-native-script-runner
 * 职责：定义 DTS ClassModel 脚本运行命令，让 native runtime 能在受控上下文中执行模型脚本。
 * 边界：只描述脚本调用输入输出，不负责生成脚本、不注册工具，也不直接访问页面配置文件。
 * AI用途：需要把 model_script tool call 交给本地脚本执行器时，用本模块确认命令载荷形状。
 */
import type { JsonValue } from '@spark-appworks/spark-json-document'
import type { AiAgentRuntimeHostContext } from '../tool-runtime'
import { AiAgentToolResult } from '../tool-runtime'
import { DtsClassModelBundleLoader } from '../../class-model/class-model/bundle/dts-class-model-bundle-loader'
import type { AiRuntimeApiMetadataJson } from '../../class-model/metadata'
import { executeModuleScript } from './native-script-sandbox'
import { createAiApiScriptContext } from './native-script-context'

/** Dts Native Script Run Command 的命令参数。 */
export type DtsNativeScriptRunCommand<TInstance = unknown> = Readonly<{
  /** 脚本执行时 this 绑定的业务根实例；DTS 模型中 rootClassName 对应的运行时对象 */
  instance: TInstance
  /** DTS ClassModel bundle 分片的 manifest.json 远程地址，用于加载元数据 */
  manifestUrl: string
  /** 业务根 className，与 manifest 中的模型声明对应，决定 API 元数据投影起点 */
  rootClassName: string
  /** 可选宿主上下文；提供运行时路径段和宿主回调，为脚本提供 sandbox 外部桥接 */
  host?: AiAgentRuntimeHostContext
  /** 自定义远程 JSON 资源获取函数；未提供时使用内置默认 fetch */
  fetchJson?: (url: string) => Promise<unknown>
  /** 待执行的 JavaScript async function body 字符串；禁止含 TypeScript/JSX/import/export 或函数包裹 */
  script: string
}>

export async function executeDtsNativeScript(
  command: DtsNativeScriptRunCommand,
): Promise<AiAgentToolResult<JsonValue>> {
  if (command.script.trim().length === 0) {
    return AiAgentToolResult.failCode(
      'SCRIPT_EMPTY',
      'native script body must not be empty.',
      '让 LLM 直接生成 JavaScript async function body，例如 return { ... }；不要生成 TypeScript/TSX/JSX、类型注解、import/export 或函数包裹；this 绑定当前业务根实例。',
    )
  }

  const metadata = await createDtsNativeRuntimeApiMetadata({
    manifestUrl: command.manifestUrl,
    rootClassName: command.rootClassName,
    ...(command.fetchJson === undefined ? {} : { fetchJson: command.fetchJson }),
  })
  const context = createAiApiScriptContext({
    instance: command.instance,
    api: metadata.rootApi,
    ctx: createNativePathContext(command.host),
    validateOptions: {},
  })
  return await executeModuleScript(command.script, context)
}

export async function createDtsNativeRuntimeApiMetadata(command: Readonly<{
  manifestUrl: string
  rootClassName: string
  fetchJson?: (url: string) => Promise<unknown>
}>): Promise<AiRuntimeApiMetadataJson> {
  const loader = new DtsClassModelBundleLoader({
    manifestUrl: command.manifestUrl,
    ...(command.fetchJson === undefined ? {} : { fetchJson: command.fetchJson }),
  })
  return await loader.buildRuntimeApiMetadata(command.rootClassName)
}

function createNativePathContext(host: AiAgentRuntimeHostContext | undefined): Readonly<{
  segments: readonly string[]
  host?: AiAgentRuntimeHostContext
}> {
  return host === undefined
    ? { segments: [] }
    : { segments: [], host }
}
