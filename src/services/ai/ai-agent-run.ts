import type {
  AiAgentHostDryRunResult,
  AiAgentHostRunResult,
  AiAgentTaskChatOptions,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'

/** 可由页面或自动化入口直接执行的前端 Agent 能力。 */
export type AiAgentRunTarget = Readonly<{
  has(alias: string): boolean
  dryRun(alias: string, args: unknown): AiAgentHostDryRunResult
  run(alias: string, args: AiJsonParams, chat?: AiAgentTaskChatOptions): Promise<AiAgentHostRunResult>
}>

/** 前端 Agent 运行前的业务上下文，不代表任何后端传输协议。 */
export type AiAgentRunRequest = Readonly<{
  requestId: string
  alias: string
  args: Record<string, unknown>
}>

export type AiAgentRunPrepare<TTarget extends AiAgentRunTarget = AiAgentRunTarget> = (
  request: AiAgentRunRequest,
  target: TTarget,
) => AiAgentRunTarget | Promise<AiAgentRunTarget>

export function chainAiAgentRunPrepare(
  ...preparers: readonly AiAgentRunPrepare[]
): AiAgentRunPrepare {
  return async (request, initialTarget) => {
    let target: AiAgentRunTarget = initialTarget
    for (const prepare of preparers) target = await prepare(request, target)
    return target
  }
}
