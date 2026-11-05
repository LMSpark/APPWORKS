/**
 * @module @spark-appworks/spark-component:components/containers/filter/expression/RendererFilterExpression/RendererFilterExpression.props
 * 职责：声明标准过滤定义编辑组件。边界：编辑绑定字段，不执行该过滤或保存文件。AI用途：生成数据空间定义编辑页面。
 */
import type {ColumnType, DataColumn, DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import type {LayoutDataContextProps} from '../../../runtime/layout-data-context'
import type {FilterExpressionEditorProps} from '../FilterExpressionEditor/FilterExpressionEditor.props'

import type {JsonPath} from '@spark-appworks/spark-json-document'
/** 字段目录的原生类型值到正式DataColumn类型的显式声明映射。 */
type FilterColumnTypeMap = Readonly<Record<string,ColumnType>>
/** 公共值函数上下文已经声明的模型目录。 */
type FilterFunctionTables = NonNullable<DataViewFilterFunctionContext['tables']>
/** 当前字段目录在值函数中的显式编辑名称，不是物理表绑定。 */
type FilterColumnTable = Pick<FilterFunctionTables[number],'name'|'label'>

/** r-filter-expression按完整视图键、数据成员和字段定位定义，写回原DataView编辑域。 */
export type RFilterExpressionProps = LayoutDataContextProps & Pick<FilterExpressionEditorProps,
  'placeholder' | 'title' | 'clearable' | 'dialogWidth' | 'autoFullscreenBelow' | 'allowedOperators'> & {
  /** 存放过滤定义的字段；与过滤树内部的条件字段不同。 */
  field: string
  /** 所属JSON字段中的过滤叶路径；只允许末级对象成员缺失。应用合并最新原字段，父路径须存在；清空依format选择移除叶、空字符串或null。 */
  valuePath?: JsonPath
  /** valuePath存在时所属原字段的存储格式；默认native原生对象，text解析JSON文本并将合并结果存回文本。不改变过滤叶format，不补建父路径。格式改变使旧应用失效，畸形原文保留。 */
  valueFormat?: 'native' | 'text'
  /** tree保存原生树（清空为undefined）；spark-json保存数据库SPARK文本（清空为空字符串）；spark-object通过同一数据层Codec保存SPARK对象（清空为null）。 */
  format?: 'tree' | 'spark-json' | 'spark-object'
  /** 默认dialog；inline在绑定位置编辑，应用才写回原DataView。 */
  display?: 'dialog' | 'inline'
  /** 弹窗入口摘要样式，box为输入框，inline为参考页的行内文本链接；不改变DataView绑定或编辑模式。 */
  displayMode?: 'box' | 'inline'
  /** 存在未应用草稿或编辑弹窗时通知true；取消、原DataView显式取消本行/全部行、应用接受、换绑定、失权及释放后通知false。取消其他行保留本行未应用输入。 */
  onEditingChange?: (editing: boolean) => void
  /** 过滤条件可使用的字段元信息，不是业务结果行；异步更新保留未应用草稿，应用时按最新目录校验。 */
  columns?: readonly DataColumn[]
  /** 字段定义目录的完整视图键，与columns互斥；用该视图valueField作为字段名、labelField作为标题，仅消费完整正式可读结果，不采用未保存目录。 */
  columnDataViewKey?: string
  /** 目录中存放字段类型的成员；配置后必须同时声明columnTypeMap，未配置时明确按文本字段编辑。 */
  columnTypeField?: string
  /** 原生数字或文本类型编码的显式映射，含0也逐值匹配；未知类型拒绝应用，不推断SQL类型或业务模型。 */
  columnTypeMap?: FilterColumnTypeMap
  /** 显式把当前可读列目录提供给引用表/表达式函数；省略或null不添加模型，空目录不保留旧模型。同名functionContext.tables冲突明确拒绝，不创建relatedFields或执行权限。 */
  columnTable?: FilterColumnTable | null
  /** 可引用的参数、模型字段和值函数扩展；更新保留打开的窗口与草稿并使旧应用回调失效，不授予服务端执行权限。 */
  functionContext?: DataViewFilterFunctionContext
  /** 输入参数候选的完整视图键；复用标准选项视图的valueField/labelField及读取权限，视图标题和禁用状态优先。更新保留未应用草稿并废弃旧应用回调；切换键释放旧编辑会话。 */
  inputParameterDataViewKey?: string
  /** 最大嵌套层数；省略沿用公共编辑器默认值。 */
  maxDepth?: number
  /** 最大条件数；省略沿用公共编辑器默认值。 */
  maxRules?: number
  /** 业务锁定只收紧原字段的数据权限。 */
  disabled?: boolean
  /** 只读浏览：允许查看条件和JSON，不能写回；false不能扩大当次DataView字段权限。 */
  readonly?: boolean
}
