/**
 * @module @spark-appworks/spark-component:components/fields/data-components/text/FieldJson/FieldJson.props
 * 职责：声明标准JSON字段的数据绑定、来源值格式与编辑器呈现。
 * 边界：编辑原DataView字段，不保存或执行JSON中的规则。
 * AI用途：通过字段子组件编辑JSON配置，复用仓内JSON编辑器。
 */
import type {SparkNodeProps, SparkFieldSemanticProps} from '../../../../shared-types'
import type {RToolbarProps} from '../../../../containers/layout/action/RendererToolbar/RendererToolbar.types'
import type {JsonPath, JsonSchemaObject, JsonValue} from '@spark-appworks/spark-json-document'
/** JSON对象数组的纯行适配；不查询、不写入DataView、不保存。输入是副本，返回值必须是JSON对象。 */
export type JsonArrayRowAdapter = {
  /** 将单个原对象投影为子字段；仅供显示，打开或取消不写回。 */
  read: (original: Readonly<Record<string, unknown>>) => Record<string, unknown>
  /** 当前行确认或inline字段输入时转换回来源对象；新增时original为undefined。只处理该行，未编辑行原样保留。 */
  write: (value: Readonly<Record<string, unknown>>, original: Readonly<Record<string, unknown>> | undefined) => Record<string, unknown>
  /** 可进一步限制新增/编辑，不能扩大原字段权限；省略表示不增加限制。 */
  canEdit?: (original: Readonly<Record<string, unknown>> | undefined) => boolean
}
/** modelValue及更新事件保持编辑器JSON文本；绑定字段可显式选择原生值格式，业务有效性仍由所属合同核定。 */
export type RJsonProps = SparkNodeProps & SparkFieldSemanticProps<string> & {
  /** 默认tree，复用JsonTreeEditor及spark-json-document的对象树；text/table使用SparkJsonEditor；rows按children维护对象数组，原字段值先于写入确认回传时保留已接纳视图及选择，不重复重建；properties按Schema维护固定对象成员；form按Schema以类型化表单维护对象及嵌套对象。均写回原字段编辑域。 */
  mode?: 'text' | 'tree' | 'table' | 'rows' | 'properties' | 'form'
  /** 绑定DataView字段的存储格式，默认text保留JSON原文；native读取/写回对象、数组或JSON标量。native的tree呈现固定value节点以支持标量，节点包装不写入字段；包裹根不可新增，value不可删除、改名或新增同级，value类型及其内部增删改仍可用并受原字段校验。其他模式直接编辑JSON文本。dataMember=rows不使用此属性。 */
  valueFormat?: 'text' | 'native'
  /** 编辑原JSON字段内已有节点的路径段；字符串是精确对象键，数字是数组下标，省略或空数组编辑整个字段。支持text/native存储格式，路径必须存在且类型匹配，不补建结构。确认时合并到原字段的最新编辑值，保留路径外成员；权限、取消及保存仍属于原字段。路径改变使旧编辑事件失效。dataMember=rows不使用此属性。 */
  valuePath?: JsonPath
  /** native字段为undefined时仅供编辑器显示的初始值，默认null；打开编辑器不写入此值。显式null/false/0/空字符串不使用初始值。 */
  emptyValue?: JsonValue
  /** properties模式按properties列出的对象成员显示名称、description、类型及值；x-typeLabel仅显示外部类型注解。等价Schema换引用保留未确认输入，实际内容变化（含嵌套修改）清除未确认输入；绑定、原值或只读状态变化继续执行标准字段重置。form模式按title/description/type、enum或oneOf中的const/title及嵌套properties呈现控件；单选、多选候选浮层按需挂载，未展开时从同一Schema严格匹配已选标题，保留未知值原显示；array成员的items含标量枚举时显示多选，保留字符串/数字/布尔类型及未列出的已有值，不拼字符串。数组中的对象/null等非标量值保持JSON编辑。required成员不可移除，其他成员可显式移除；空数组与移除配置不同。未知成员和不匹配的原值保留，不填充default，不替代领域校验；复杂值可切换text/tree编辑。form模式的标量枚举成员可设置x-control='radio'改用单选组；省略时使用下拉框。只改变呈现，不补默认值、不转换字符串/数字/布尔类型；未匹配的已有值继续展示并保留。
   * form/properties模式保留change前的输入过程，change后写回原字段；被拒输入保留供纠正，可通过成员的取消输入恢复原字段显示。form的JSON输入必须合法，properties的非JSON输入按文本处理。未确认输入及等待写回通过onEditingChange通知宿主；兄弟成员接纳不清除其他未确认输入；实际Schema、目标成员原值或只读上下文变化清除对应未确认文本。原DataView明确取消当前行或全部行时，未写入字段的输入同样清除，取消其他行不影响当前输入。 */
  schema?: JsonSchemaObject
  /** properties模式的值标题，缺省“值”。输入change时按JSON值解析，非法JSON保留去除首尾空白的文本；如需字符串0请输入带引号的"0"。 */
  valueLabel?: string
  /** 编辑区域高度，省略时320像素。 */
  height?: number | string
  /** rows模式的最大高度；设置后按内容收缩，不强制height。 */
  maxHeight?: number | string
  /** dataMember=rows时只读展示绑定DataView的可读结果；true同时展示fields/total/page/pageSize，默认false仅展示rows。不输出权限凭据，不改变查询配置或写回字段。 */
  includeQueryInfo?: boolean
  /** rows模式追加到行工具栏的标准动作，复用RToolbarProps及children；跨编辑域动作须显式dataViewKey。 */
  toolbar?: RToolbarProps
  /** rows模式允许上移/下移选中对象，默认false。数组次序直接写回原字段编辑域；不添加顺序属性。行编辑或提交期间不可重排，仍受原字段权限及过期写入守卫约束。 */
  reorderable?: boolean
  /** rows模式的领域行适配。省略时对象成员直接对应子字段；适配改变会撤销未确认行编辑。row确认失败保留行草稿；inline输入失败保留原值。均不修改原字段。 */
  rowAdapter?: JsonArrayRowAdapter
  /** rows模式默认row显式确认每行；inline直接显示标准子字段并按输入顺序写原字段编辑域，只有新增/删除，不增加后端提交。回传保留输入焦点与选择；异步写入期间onEditingChange为true，外层保存应等待，取消或换绑定使旧输入失效。 */
  rowEditMode?: 'row' | 'inline'
  /** rows模式有未确认行编辑或等待原字段写入时通知宿主；inline只在排队写入期间为true。form/properties模式有未确认文本（含被拒输入及嵌套成员）或等待写回时为true。tree/text/table模式将内容输入、等待原字段接纳和被拒内容合并报告；底层编辑器的搜索/筛选不算数据编辑。等待期间锁定后续输入；接纳后恢复false，被拒内容可继续纠正或明确取消，取消恢复原字段的当前值且旧事件失效。宿主可阻止切换及保存，但须允许当前输入继续纠正。多个编辑器的宿主按各自身份汇总状态。取消当前行、换绑定、失权和释放后通知false；旧异步回调不清除新上下文的输入状态。不表示已提交后端。 */
  onEditingChange?: (editing: boolean) => void
}
