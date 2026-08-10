/**
 * @module @spark-appworks/spark-component:components/create-passthrough
 * 职责：提供 create passthrough 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */
/**
 * 透传组件工厂 — 用 1 个函数替代 14+ 个零逻辑 .vue 包装文件。
 *
 * 每个 passthrough 组件的行为完全相同：
 *   1. `useSparkPageComponent(props)` 接入 SPARK 能力上下文
 *   2. `isVisible` 控制渲染
 *   3. 所有 attrs 透传到目标渲染节点
 *   4. `children` 递归渲染
 *
 */
import { h, computed, defineComponent, resolveComponent, type Component } from 'vue'
import SparkComponentRenderer from './SparkComponentRenderer.vue'
import { useSparkPageComponent, type SparkNodeInput } from './internal.js'
import { type SparkNodeChildren, getSparkNodeChildren, isSparkNode, nodeId } from '@spark-appworks/spark-data'

/** 透传组件配置 */
type PassthroughOptions = {
  /** 属性默认值，key 为透传给目标渲染节点的 prop 名。 */
  propDefaults?: Record<string, unknown>}

function isSparkNodeChild(value: unknown): value is SparkNodeChildren[number] {
  return typeof value === 'string' || typeof value === 'number' || isSparkNode(value)
}

function readSparkNodeChildren(value: unknown, context: string): SparkNodeChildren | undefined {
  if (value === undefined) return undefined
  if (Array.isArray(value) && value.every(isSparkNodeChild)) return value
  throw new TypeError(`[spark] ${context} must be SparkNodeChildren`)
}

/**
 * 创建一个透传渲染组件。
 *
 * @param elTag  - 目标节点标签
 * @param type   - SPARK 注册类型名，如 `'r-row'`
 * @param options - 可选配置（默认属性注入）
 */
export function createPassthrough(
  elTag: string,
  type: string,
  options?: PassthroughOptions,
): Component {
  const defaults = options?.propDefaults

  return defineComponent({
    name: `Passthrough_${type}`,
    inheritAttrs: false,
    props: {
      type: { type: String, default: type },
      children: { type: Array, default: undefined },
    },
    setup(props, { attrs }) {
      const rawChildren = readSparkNodeChildren(props.children, `${type}.children`)
      const sparkNodeInput: SparkNodeInput = {
        type: props.type,
        ...(rawChildren !== undefined ? { children: rawChildren } : {}),
      }
      const { isVisible } = useSparkPageComponent(sparkNodeInput)
      const resolvedChildren = computed(() =>
        getSparkNodeChildren(readSparkNodeChildren(props.children, `${type}.children`)),
      )

      return () => {
        if (!isVisible.value) return null

        // 构建传给 el-* 的 attrs：注入默认值（仅当 attrs 未显式声明）→ 原样透传
        let finalAttrs: Record<string, unknown> = attrs
        if (defaults) {
          const patched: Record<string, unknown> = { ...attrs }
          for (const [key, def] of Object.entries(defaults)) {
            if (!(key in patched)) {
              patched[key] = def
            }
          }
          finalAttrs = patched
        }

        const children = resolvedChildren.value
        if (children.length === 0) {
          return h(resolveComponent(elTag), finalAttrs)
        }

        const childVNodes = children.map((child, i) =>
          h(SparkComponentRenderer, { key: nodeId(child) ?? `${type}-child-${i}`, config: child }),
        )
        return h(resolveComponent(elTag), finalAttrs, { default: () => childVNodes })
      }
    },
  })
}

