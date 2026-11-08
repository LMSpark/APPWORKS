/**
 * @module @spark-appworks/spark-app:router/native-page-runtime-session
 * 职责：原生 Vue 页共用的 PageRuntime 创建、提供、换目标失效与释放。
 * 边界：不注册路由、不换接领域页面；配置页继续走 PageRuntimePool。
 * AI用途：原生页需要同一调用身份复用实例、目标切换后停旧写入时，用本模块。
 */
import {PageRuntime, type PageRuntimeOptions} from '@spark-appworks/spark-project-model'

/** 原生页一次调用的固定身份；targetId 是业务目标，不是第二个场景身份。 */
export type NativePageRuntimeIdentity = Readonly<{
  pageId: string
  scenarioIds: readonly string[]
  mainScenarioId?: string
  deferredScenarioIds?: readonly string[]
  targetId?: string
  scenarioInputs?: PageRuntimeOptions['scenarioInputs']
}>

/** 创建原生 PageRuntime 所需的调用身份与装配回调。 */
export type NativePageRuntimeAcquireInput = NativePageRuntimeIdentity & Readonly<{
  loadScenario: PageRuntimeOptions['loadScenario']
}>

/** 把当前实例提供给页面能力树；换目标或释放时先 remove。 */
export type NativePageRuntimeBinder = Readonly<{
  provide(runtime: PageRuntime): void
  remove(): void
}>

function identityKey(input: NativePageRuntimeIdentity): string {
  return JSON.stringify([
    input.pageId,
    [...input.scenarioIds],
    input.mainScenarioId ?? null,
    input.deferredScenarioIds ? [...input.deferredScenarioIds] : null,
    input.targetId ?? null,
    input.scenarioInputs ?? null,
  ])
}

/** 原生页 PageRuntime 会话：同一身份复用，换目标先释放旧实例。 */
export class NativePageRuntimeSession {
  #runtime: PageRuntime | undefined = undefined
  #key: string | undefined = undefined
  readonly #binder: NativePageRuntimeBinder | undefined

  constructor(binder?: NativePageRuntimeBinder) {
    this.#binder = binder
  }

  /** 当前仍由本会话持有的运行实例。 */
  get runtime(): PageRuntime | undefined { return this.#runtime }

  /** 同一路由身份复用实例；身份变化时释放旧实例后再创建。 */
  acquire(input: NativePageRuntimeAcquireInput): PageRuntime {
    const key = identityKey(input)
    const current = this.#runtime
    if (current && !current.destroyed && this.#key === key) return current
    this.release()
    const runtime = new PageRuntime({
      pageId: input.pageId,
      scenarioIds: input.scenarioIds,
      loadScenario: input.loadScenario,
      ...(input.mainScenarioId === undefined ? {} : {mainScenarioId: input.mainScenarioId}),
      ...(input.deferredScenarioIds === undefined ? {} : {deferredScenarioIds: input.deferredScenarioIds}),
      ...(input.scenarioInputs === undefined ? {} : {scenarioInputs: input.scenarioInputs}),
    })
    this.#runtime = runtime
    this.#key = key
    this.#binder?.provide(runtime)
    return runtime
  }

  /** 仅当该实例仍是本会话当前 owner 时为 true。 */
  isCurrent(runtime: PageRuntime): boolean {
    return this.#runtime === runtime && !runtime.destroyed
  }

  /** 释放当前实例并撤销提供；迟到装配由 PageRuntime 拒绝。 */
  dispose(): void { this.release() }

  private release(): void {
    const current = this.#runtime
    this.#runtime = undefined
    this.#key = undefined
    this.#binder?.remove()
    current?.dispose()
  }
}
