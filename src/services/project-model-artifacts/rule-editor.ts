/**
 * @module app:services/project-model-artifacts/rule-editor
 * 职责：提供应用运行时 service 层的 rule editor 能力，连接项目模型、AI Host、租户上下文或页面设计流程。
 * 边界：负责 src 应用侧编排，不修改底层包协议，也不绕过已注册的 capability/data 管线。
 * AI用途：排查应用侧服务如何调用 spark-ai 或项目模型时，用本模块确认运行时接线。
 */
/**
 * DevSystem 规则编辑器制品：规则树策略与规则 JSON Schema。
 * 属于应用层，不属于 spark-project-model 领域包。
 */

import type {
  AutoPopulateEntry,
  JsonObject,
  JsonPath,
  JsonTreePolicy,
  JsonValue,
} from '@spark-appworks/spark-json-document'
import { ensureUniqueObjectKey, withMeta } from '@spark-appworks/spark-json-document'

// ── SECTION 1: 规则树编辑策略 ──

const SPARK_NODE_STRUCT_KEYS = new Set(['type', 'props', 'children'])

function isSparkNodeRoot(path: JsonPath): boolean {
  if (path.length === 0) return true
  const last = path[path.length - 1]
  if (typeof last !== 'number') return false
  if (path.length === 1) return true
  const prev = path[path.length - 2]
  return prev === 'children'
}

function isTypeField(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (last !== 'type') return false
  return isSparkNodeRoot(path.slice(0, -1))
}

function isChildrenArray(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (last !== 'children') return false
  return isSparkNodeRoot(path.slice(0, -1))
}

function isPropsObject(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (last !== 'props') return false
  return isSparkNodeRoot(path.slice(0, -1))
}


function isProtected(path: JsonPath): boolean {
  if (isTypeField(path)) return true
  if (isChildrenArray(path)) return true
  if (isPropsObject(path)) return true
  return false
}

function canEditKey(path: JsonPath): boolean {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (typeof last === 'string' && SPARK_NODE_STRUCT_KEYS.has(last)) {
    if (isSparkNodeRoot(path.slice(0, -1))) return false
  }
  return typeof last === 'string'
}

function canEditType(path: JsonPath): boolean {
  if (path.length === 0) return false
  if (isTypeField(path)) return false
  if (isSparkNodeRoot(path)) return false
  if (isChildrenArray(path)) return false
  if (isPropsObject(path)) return false
  return true
}

function suggestChildKey(target: JsonObject, parentPath: JsonPath): string {
  if (isSparkNodeRoot(parentPath)) {
    const preferredKeys = ['props', 'children', 'id']
    for (const key of preferredKeys) {
      if (!(key in target)) return key
    }
    return ensureUniqueObjectKey(target, 'custom')
  }

  if (isPropsObject(parentPath)) {
    const preferredProps = ['dataViewKey', 'dataMember', 'dataField', 'field', 'label', 'visible', 'disabled']
    for (const key of preferredProps) {
      if (!(key in target)) return key
    }
    return ensureUniqueObjectKey(target, 'newProp')
  }

  return ensureUniqueObjectKey(target, 'newKey')
}

function createDefaultArrayItem(parentPath: JsonPath): JsonValue {
  if (isChildrenArray(parentPath)) return { type: 'div' }
  return ''
}

function createDefaultObjectValue(parentPath: JsonPath, key: string): JsonValue {
  if (isSparkNodeRoot(parentPath)) {
    if (key === 'props') return {}
    if (key === 'children') return []
    if (key === 'id') return ''
    return ''
  }
  if (isPropsObject(parentPath)) {
    if (key === 'visible' || key === 'disabled') return false
    if (key === 'on') return {}
    return ''
  }
  return ''
}

export function createRuleTreePolicy(): JsonTreePolicy {
  return {
    rootLabel: 'rule',
    isProtected,
    canEditKey,
    canEditType,
    suggestChildKey,
    createDefaultArrayItem,
    createDefaultObjectValue,
    getValueOptions(): string[] | undefined {
      return undefined
    },
    getValueLabels(): Array<{ label: string; value: string }> | undefined {
      return undefined
    },
    getAutoPopulate(changedPath: JsonPath, newValue: JsonValue): AutoPopulateEntry[] | undefined {
      if (!isTypeField(changedPath) || typeof newValue !== 'string') return undefined
      return [{
        targetPath: changedPath.slice(0, -1),
        entries: { props: {} },
      }]
    },
  }
}

// ── SECTION 2: 规则 JSON Schema ──

export function createRuleJsonSchema(): Record<string, unknown> {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'SPARK 页面规则配置',
    description: 'SparkNode 数组，描述页面组件树。每个节点为 type / props / children 三段式。',
    type: 'array',
    items: { $ref: '#/$defs/sparkNode' },
    $defs: {
      sparkNode: withMeta('组件节点 Component Node', '严格对齐 SparkNode 结构：type / id / props / children。id 是节点顶层稳定标识，禁止写入 props.id。', {
        type: 'object',
        properties: {
          type: withMeta('组件类型 Component Type', '组件注册名（kebab-case），如 r-table / el-button / div。', { type: 'string' }),
          id: withMeta('节点标识 Component ID', 'SparkNode 顶层稳定 id，用于脚本寻址和渲染 key。不要放到 props.id。', { type: 'string' }),
          props: withMeta('组件属性 Props', '传给组件的业务属性。dataViewKey / dataMember / dataField / contextDataMember / contextDataField / field / label / on / visible / disabled 等在此声明；id 必须写在节点顶层。', {
            type: 'object',
            additionalProperties: true,
          }),
          children: withMeta('子节点 Children', '子组件配置数组（递归 SparkNode），也可包含字符串/数字文本子节点。', {
            type: 'array',
            items: {
              oneOf: [
                { $ref: '#/$defs/sparkNode' },
                { type: 'string', title: '文本子节点 Text Node', description: '纯文本内容。' },
                { type: 'number', title: '数字子节点 Number Node', description: '数字文本内容。' },
              ],
            },
          }),
          dataViewKey: withMeta('DataView 定位键 DataView Key', '页面绑定格式：#scenarioId@modelName@viewId（数据空间 ID、模型名称、视图 ID）；明确主场景时可用 modelName@viewId。正式模型名称取 modelBinding.modelName，本地模型取自身 tableName。', { type: 'string' }),
          dataMember: withMeta('DataView 成员 Data Member', 'DataView 成员枚举，如 rows、currentRow、aggregateResult。', {
            type: 'string',
            enum: ['rows', 'columns', 'currentRow', 'selectedRows', 'aggregateResult', 'selectionAggregateResult', 'total', 'page', 'pageSize', 'requestState', 'mutating', 'loadingError', 'mutatingError'],
          }),
          dataField: withMeta('DataView 成员字段 Data Field', 'DataView 成员内部业务字段或点路径，如 name、totalAmount。', { type: 'string' }),
          contextDataMember: withMeta('上下文 DataView 成员 Context Data Member', 'r-form / r-detail 的上下文成员，默认通常为 currentRow。', { type: 'string' }),
          contextDataField: withMeta('上下文字段 Context Data Field', '上下文成员内部业务字段或点路径。', { type: 'string' }),
          field: withMeta('字段名 Field', '字段组件绑定的列名。', { type: 'string' }),
          label: withMeta('标签 Label', '字段组件或列的显示标题。', { type: 'string' }),
          on: withMeta('事件绑定 Events', '事件名到 script.js 函数名的映射，如 { "click": "handleClick" }。', {
            type: 'object',
            additionalProperties: { type: 'string' },
          }),
          visible: withMeta('是否可见 Visible', '控制组件可见性。false 时组件不渲染。', { type: 'boolean' }),
          disabled: withMeta('是否禁用 Disabled', '控制组件禁用状态。', { type: 'boolean' }),
          style: withMeta('内联样式 Style', 'CSS 样式对象（camelCase）。', {
            type: 'object',
            additionalProperties: true,
          }),
          class: withMeta('CSS 类名 Class', 'CSS 类名字符串。', { type: 'string' }),
          name: withMeta('元素名称 Name', '表单元素命名，用于 DOM 查询。', { type: 'string' }),
        },
        required: ['type'],
        additionalProperties: true,
      }),
    },
  }
}
