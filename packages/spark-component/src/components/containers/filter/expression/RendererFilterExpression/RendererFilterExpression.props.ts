/**
 * @module @spark-appworks/spark-component:components/containers/filter/expression/RendererFilterExpression/RendererFilterExpression.props
 * 职责：声明标准过滤定义编辑组件。边界：编辑绑定字段，不执行该过滤或保存文件。AI用途：生成数据空间定义编辑页面。
 */
import type {DataColumn, DataViewFilterFunctionContext} from '@spark-appworks/spark-data'
import type {LayoutDataContextProps} from '../../../runtime/layout-data-context'
import type {FilterExpressionEditorProps} from '../FilterExpressionEditor/FilterExpressionEditor.props'

/** r-filter-expression按完整视图键、数据成员和字段定位定义，写回原DataView编辑域。 */
export type RFilterExpressionProps = LayoutDataContextProps & Pick<FilterExpressionEditorProps,
  'placeholder' | 'title' | 'clearable' | 'dialogWidth' | 'autoFullscreenBelow'> & {
  /** 存放过滤定义的字段；与过滤树内部的条件字段不同。 */
  field: string
  /** tree保存原生树（清空为undefined）；spark-json保存数据库SPARK文本（清空为空字符串）。 */
  format?: 'tree' | 'spark-json'
  /** 默认dialog；inline在绑定位置编辑，应用才写回原DataView。 */
  display?: 'dialog' | 'inline'
  /** 弹窗入口摘要样式，box为输入框，inline为参考页的行内文本链接；不改变DataView绑定或编辑模式。 */
  displayMode?: 'box' | 'inline'
  /** 存在未应用草稿或编辑弹窗时通知true；取消、应用接受、换绑定、失权及释放后通知false。 */
  onEditingChange?: (editing: boolean) => void
  /** 过滤条件可使用的字段元信息，不是业务结果行；异步更新保留未应用草稿，应用时按最新目录校验。 */
  columns: readonly DataColumn[]
  /** 可引用的参数、模型字段和值函数扩展；更新保留打开的窗口与草稿并使旧应用回调失效，不授予服务端执行权限。 */
  functionContext?: DataViewFilterFunctionContext
  /** 最大嵌套层数；省略沿用公共编辑器默认值。 */
  maxDepth?: number
  /** 最大条件数；省略沿用公共编辑器默认值。 */
  maxRules?: number
  /** 业务锁定只收紧原字段的数据权限。 */
  disabled?: boolean
  /** 只读浏览：允许查看条件和JSON，不能写回；false不能扩大当次DataView字段权限。 */
  readonly?: boolean
}
