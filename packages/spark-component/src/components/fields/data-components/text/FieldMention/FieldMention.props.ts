/**
 * @module @spark-appworks/spark-component:components/fields/data-components/text/FieldMention/FieldMention.props
 * 职责：定义 FieldMention（r-mention）的配置属性契约，把页面 JSON 中的字段、数据绑定、显示选项和交互开关约束成可生成的类型。
 * 边界：只描述 field-level/data-field 组件的声明式配置，不读取 DataSet、不触发运行时事件，也不直接渲染 DOM。
 * AI用途：生成或修订页面配置时，用本模块判断 field mention 允许哪些 props、哪些字段属于数据绑定，避免把运行时 API 写进配置。
 */
import type { SparkMultilineFieldProps, SparkNodeProps } from '../../../../shared-types'

/** Mention 候选项：提供展示值、标签、禁用状态和可选的持久化回写值。 */
export type RMentionOption = {
  /** 展示值（必填）。 */
  value: string
  /** 展示标签。 */
  label?: string
  /** 当前候选项是否禁用。 */
  disabled?: boolean
  /** @internal 供 trigger.writebackField 使用的持久化值，例如选项 ID。 */
  persistedValue?: string | number | boolean}

/** RMention Props 的属性契约。 */
export type RMentionProps = SparkNodeProps & SparkMultilineFieldProps & {
  /**
     * 完整的提及触发规则列表。
     *
     * 每一项描述一个前缀触发器的完整结构：
     * - `prefix`：触发字符
     * - `split`：选中后写回文本的分隔符
     * - `writebackField`：选中候选项后，把候选项值额外回写到宿主哪一个字段
     * - `options.dataViewKey`：候选项数据源
      * - `options.valueField / labelField / disabledField`：候选项字段映射
     * - `searchable`：是否启用本地候选项过滤
     *
    * 主输入文本本身走继承自 `SparkFieldSemanticProps` 的 `modelValue/field` 语义：
     * - `modelValue` 表示当前 Mention 输入框中的文本值
     * - `field` 表示这份文本最终持久化到宿主数据行的哪个字段
     *
     * 注意：底层 el-mention 只支持一个全局 `split`；
     * 若这里配置了多项且 `split` 不一致，组件会直接 fail-fast。
     */
    mentionTriggers?: Array<{
      /** 触发字符，必须是单个字符。 */
      prefix: string
      /** 选中后写回文本的分隔符。 */
      split?: string
      /**
       * 额外回写宿主字段。
       *
       * 选中候选项后，会把 `options.valueField` 对应的候选项值写入当前宿主数据行的这个字段。
       * 这用于“输入框里保留可读文本，但额外持久化选项 ID”这一类场景。
       */
      writebackField?: string
      /** 是否启用本地候选项过滤。 */
      searchable?: boolean
      /** 候选项来源与字段映射。 */
      options?: {
        /** 候选项 DataView，例如 `Users@default`。 */
        dataViewKey?: string
        /**
         * 候选项值字段。
         *
         * 用于指定从候选项数据源的哪个字段读取值，并映射为 el-mention 的 `option.value`。
         * 用户选中候选项后，这个值会进入宿主输入框文本；
         * 但这不是对候选项数据源的“回写”，候选项表本身不会因此被修改。
         */
        valueField?: string
        /** 候选项显示字段。 */
        labelField?: string
        /** 候选项禁用字段。 */
        disabledField?: string
      }
    }>
  
    /**
     * @internal Mention 候选项结果集。
     *
     * 页面配置层应通过 `mentionTriggers[].options` 提供候选项来源；
     * 组件运行时会先把这些配置解析为真正传给 el-mention 的候选项。
     * 这里保留该字段，只用于组件内部或受控场景直接覆盖那份“已计算好的结果集”。
     *
     * `persistedValue` 只服务于内部回写宿主字段，不会直接显示在输入框里。
     */
    options?: RMentionOption[]
  
    /** 候选浮层位置 */
    placement?: 'top' | 'bottom'
    /** 是否显示箭头 */
    showArrow?: boolean
    /** 浮层偏移 */
    offset?: number
    /** 是否整词匹配 */
    whole?: boolean
    /** 自定义整词判断 */
    checkIsWhole?: (pattern: string, prefix: string) => boolean
    /** 是否加载态 */
    loading?: boolean
    /** 输入框类型 */
    inputType?: 'text' | 'textarea'}
