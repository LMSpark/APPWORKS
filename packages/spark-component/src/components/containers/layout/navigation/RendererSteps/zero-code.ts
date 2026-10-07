/**
 * @module @spark-appworks/spark-component:components/containers/layout/navigation/RendererSteps/zero-code
 * 职责：封装 RendererSteps（r-steps）的 zero-code 行为层，向配置动作和脚本暴露稳定的组件操作 API。
 * 边界：只编排 container/layout-container 的运行时能力、原生组件引用和事件控制，不声明视觉 props，也不持久化业务数据。
 * AI用途：当动作、脚本或 ClassModel 需要调用 renderer steps 的选择、刷新、编辑、分页或树/表操作时，使用本模块确认 API 语义。
 */
import type { RendererStepsApi } from './types'
import type { ValueRef } from '../../../../shared-types.js'
import type { SparkNode } from '@spark-appworks/spark-data'

/** Steps Emit 的语义模型。 */
type StepsEmit = {
  (event: 'update:modelValue', value: string | number): void}

/** Renderer Steps Zero Code Options 的调用配置。 */
type RendererStepsZeroCodeOptions = {
    /** emit 字段。 */
emit: StepsEmit
    /** step Configs 字段。 */
stepConfigs: ValueRef<SparkNode[]>
    /** active Step Name 名称。 */
activeStepName: ValueRef<string | number | undefined>
    /** active Step Index 字段。 */
activeStepIndex: ValueRef<number>
    /** get Step Name 名称。 */
getStepName: (step: SparkNode, index: number) => string | number
    /** on Step Change 事件回调。 */
onStepChange: ((value: string | number, step: SparkNode, index: number) => void) | undefined}

export function createRendererStepsZeroCode(options: RendererStepsZeroCodeOptions) {
  function activateStep(index: number): void {
    const step = options.stepConfigs.value[index]
    if (!step) return
    const nextValue = options.getStepName(step, index)
    options.activeStepName.value = nextValue
    options.emit('update:modelValue', nextValue)
    options.onStepChange?.(nextValue, step, index)
  }

  const stepsApi: RendererStepsApi = {
    getActiveStep() {
      return options.activeStepName.value
    },
    getActiveStepIndex() {
      return options.activeStepIndex.value
    },
    setActiveStep(index) {
      activateStep(index)
    },
    nextStep() {
      const next = options.activeStepIndex.value + 1
      if (next < options.stepConfigs.value.length) activateStep(next)
    },
    prevStep() {
      const prev = options.activeStepIndex.value - 1
      if (prev >= 0) activateStep(prev)
    },
    getStepCount() {
      return options.stepConfigs.value.length
    },
    getStepNames() {
      return options.stepConfigs.value.map((step, index) => options.getStepName(step, index))
    },
    isFirstStep() {
      return options.activeStepIndex.value === 0
    },
    isLastStep() {
      return options.activeStepIndex.value >= options.stepConfigs.value.length - 1
    },
  }

  return {
    stepsApi,
    activateStep,
  }
}