/**
 * @module @spark-appworks/spark-ai:agent/business/business-registry
 * 职责：维护 AiAgentRegistration 的内存注册表，按 moduleId 注册、查询、列出和删除业务定义。
 * 边界：只保证注册项唯一性和 sessionStore 显式注入，不创建业务 task、不启动 session，也不解析 alias。
 * AI用途：排查业务是否已注册、moduleId 是否冲突或 registration 缺少 sessionStore 时，用本模块确认注册表规则。
 */

import { isRecord } from '@spark-appworks/spark-utils'
import type { JsonParams } from '@spark-appworks/spark-json-document'
import type { AiAgentRegistration } from './registration-types'

/** Host 内部业务注册表，按 moduleId 保存 AI 业务定义并保护注册期不变量。 */
export class AiAgentRegistry<TInput extends JsonParams = JsonParams> {
  /** moduleId → AiAgentRegistration */
  private readonly registrations = new Map<string, AiAgentRegistration<TInput>>()

  /**
   * 注册一份业务定义到 moduleId 索引，供 Host.run 和 session 解析时使用。
   *
   * @param registration 包含输入契约、工具运行时、会话存储和生命周期钩子的业务注册项。
   * @throws moduleId 已存在或 registration 未显式提供 sessionStore 时抛错，避免运行期出现半注册业务。
   */
  public register(registration: AiAgentRegistration<TInput>): void {
    if (this.registrations.has(registration.moduleId)) {
      throw new Error(`Duplicate AI host business registration: ${registration.moduleId}`)
    }
    if (!hasExplicitSessionStore(registration)) {
      throw new Error(`AI agent registration requires explicit sessionStore: ${registration.moduleId}`)
    }
    this.registrations.set(registration.moduleId, registration)
  }

  /** 按 moduleId 查询已注册业务；未命中时返回 undefined，由调用方决定是否 fail-fast。 */
  public get(moduleId: string): AiAgentRegistration<TInput> | undefined {
    return this.registrations.get(moduleId)
  }

  /** 列出当前所有业务注册项，供 Host 诊断、dry-run 和对外摘要使用。 */
  public list(): ReadonlyArray<AiAgentRegistration<TInput>> {
    return [...this.registrations.values()]
  }

  /** 删除一个业务注册项，供 Host.unregister 同步维护 alias 映射和注册表状态。 */
  public delete(moduleId: string): boolean {
    return this.registrations.delete(moduleId)
  }
}

function hasExplicitSessionStore(value: unknown): boolean {
  return isRecord(value) && 'sessionStore' in value && value['sessionStore'] !== undefined
}
