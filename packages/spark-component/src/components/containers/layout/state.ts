/**
 * @module @spark-appworks/spark-component:components/containers/layout/state
 * 职责：支撑 state（未注册组件类型）在 container/layout-container 中的运行时协作，补齐配置、状态或渲染器之间的连接逻辑。
 * 边界：只覆盖当前组件目录 containers/layout 的局部能力，不定义全局页面模型，也不越级操作业务数据源。
 * AI用途：需要判断 state 的组件分层、辅助类型或内部接线时，用本模块作为局部语义入口。
 */
import { onBeforeUnmount, shallowRef, watch, type ShallowRef } from 'vue'
import type { ValueRef } from '../../shared-types.js'

export function useMirroredValue<T>(source: ValueRef<T>): ShallowRef<T> {
  const state = shallowRef<T>(source.value)
  watch(() => source.value, value => {
    state.value = value
  }, { immediate: true })
  return state
}

export function useDefaultedSelection<TItem, TValue>(options: {
  value: ValueRef<TValue | undefined>
  items: ValueRef<TItem[]>
  getValue: (item: TItem, index: number) => TValue
}): ShallowRef<TValue | undefined> {
  const state = shallowRef<TValue | undefined>(options.value.value)

  watch(() => options.value.value, value => {
    state.value = value
  }, { immediate: true })

  watch(() => options.items.value, items => {
    if (state.value !== undefined) return
    for (const firstItem of items) {
      state.value = options.getValue(firstItem, 0)
      return
    }
  }, { immediate: true })

  return state
}

/** Unified Value Bridge Options 的调用配置。 */
export type UnifiedValueBridgeOptions<TValue> = {
    /** 当前值。 */
value: ValueRef<TValue | undefined>
    /** fallback Value 字段。 */
fallbackValue: TValue
    /** debounce Ms 字段。 */
debounceMs?: number
    /** normalize 回调。 */
normalize?: (value: TValue | undefined) => TValue
    /** equals 回调。 */
equals?: (a: TValue, b: TValue) => boolean
    /** emit Value 回调。 */
emitValue?: (value: TValue) => void}

/** Commit Value Options 的调用配置。 */
type CommitValueOptions = {
    /** emit 字段。 */
emit?: boolean}

export function useUnifiedValueBridge<TValue>(options: UnifiedValueBridgeOptions<TValue>): {
  state: ShallowRef<TValue>
  commitValue: (value: TValue, options?: CommitValueOptions) => void
  flushPendingEmit: () => void
} {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-argument */
   
  const normalize: (value: TValue | undefined) => TValue = (value: TValue | undefined): TValue => {
    if (options.normalize) {
      return options.normalize(value)
    }
    return value ?? options.fallbackValue
  }
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const isEqual: (a: TValue, b: TValue) => boolean = options.equals || Object.is
  const debounceMs = Math.max(0, options.debounceMs ?? 0)

  function readIncomingValue(): TValue {
    return normalize(options.value.value)
  }

  const state = shallowRef<TValue>(readIncomingValue())
  let emitTimer: ReturnType<typeof setTimeout> | null = null
   
  let pendingEmittedValue: TValue | undefined = undefined
  let hasLastEmittedValue = false
  let lastEmittedValue = state.value

  watch(
    () => options.value.value,
    () => {
      state.value = readIncomingValue()
    },
    { immediate: true }
  )

  function emitOnce(value: TValue): void {
     
    if (hasLastEmittedValue && isEqual(lastEmittedValue, value)) return

    options.emitValue?.(value)
    lastEmittedValue = value
    hasLastEmittedValue = true
  }

  function clearPendingEmitTimer(): void {
    if (emitTimer === null) return
    clearTimeout(emitTimer)
    emitTimer = null
  }

  function flushPendingEmit(): void {
    if (pendingEmittedValue === undefined) return
     
    const value = pendingEmittedValue
    pendingEmittedValue = undefined
    clearPendingEmitTimer()
    emitOnce(value)
  }

  function scheduleEmit(value: TValue): void {
    if (debounceMs <= 0) {
      emitOnce(value)
      return
    }
    pendingEmittedValue = value
    clearPendingEmitTimer()
    emitTimer = setTimeout(() => {
      flushPendingEmit()
    }, debounceMs)
  }

  function commitValue(value: TValue, commitOptions?: CommitValueOptions): void {
    state.value = value
    if (commitOptions?.emit === false) return
    scheduleEmit(value)
  }

  onBeforeUnmount(() => {
    clearPendingEmitTimer()
  })

  /* eslint-enable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-argument */
  return {
    state,
    commitValue,
    flushPendingEmit,
  }
}
