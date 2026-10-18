/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererGraph/RendererGraph.props
 * 职责：声明节点与关系DataView驱动的关系图及可取消的对象选择。
 * 边界：节点和边来自视图，位置只是布局；不推导关系、授权或保存业务记录。
 * AI用途：先绑定节点模型与关系模型，再指定显示字段和端点字段。
 */
import type {SparkNodeProps, SparkTableModelProps} from '../../../shared-types'
import type {RToolbarProps} from '../../layout/action/RendererToolbar/RendererToolbar.types'
import type {GraphCanvasPoint} from './GraphCanvas.types'

/** 一次整图对齐建议；同步接收并更新布局属性，或取消。组件不写入任何DataView。 */
export type GraphArrange = Readonly<{
  /** 全部可见节点的原始主键及新中心坐标；隐藏节点保持不变。 */
  nodes: ReadonlyArray<Readonly<{id: string | number; x: number; y: number}>>
  /** 已配置显式路径的可见边的新路径；自动连线仍由画布计算。 */
  edges: GraphNodeMove['edges']
  /** owner预检失败时同步设为true，阻止完成及自动适应。 */
  control: {cancel: boolean}
}>

/** 标准关系图实例API；工具栏可调用，所有动作只作用于当前已绑定实例。 */
export type RendererGraphApi = {
  /** 将当前受控节点/连线选择重新应用到画布，无当前元素则清除高亮；不触发onSelect或修改DataView指针、值与数据。绑定/当前元素在等待中变化、身份无效、不可见、禁用或销毁时返回false。 */
  selectCurrent(): Promise<boolean>
  /** 将可见节点集合居中，保持当前缩放，不修改布局。 */
  center(): Promise<boolean>
  /** 缩放和平移到可见节点全图，不修改布局。 */
  fitView(): Promise<boolean>
  /** 放大当前视口，不修改布局。 */
  zoomIn(): Promise<boolean>
  /** 缩小当前视口，不修改布局。 */
  zoomOut(): Promise<boolean>
  /** 全部可见节点可拖动且投影无诊断时，发送onArrange；owner同步确认后适应新布局。无回调、取消、失效或不可编辑返回false。 */
  arrange(): Promise<boolean>
}

/** 一次受控布局移动；坐标不写入节点/关系记录。 */
export type GraphNodeMove = Readonly<{
  /** 节点DataView原始主键。 */
  id: string | number
  /** 节点中心水平坐标。 */
  x: number
  /** 节点中心垂直坐标。 */
  y: number
  /** 有显式折线的关联边；端点随节点移动，其余端点保持不变。 */
  edges: ReadonlyArray<Readonly<{
    /** 关系DataView原始主键。 */
    id: string | number
    /** 新折线路径；由布局owner确认或丢弃。 */
    pointsList: readonly GraphCanvasPoint[]
  }>>
}>

/** 图中一次对象选择；取消时不改变所属DataView的当前行。 */
export type GraphSelection = {
  /** 节点或关系记录。 */
  kind: 'node' | 'edge'
  /** 所属视图的主键，保留原始类型。 */
  id: string | number
  /** 双击为true，可由页面打开对象配置。 */
  open: boolean
  /** 同步设为true可阻止当前行切换。 */
  control: {cancel: boolean}
}

/** 节点类别的显示选项；仅转换可读的原始值，不改写DataView。 */
export type GraphCaptionOption = Readonly<{
  /** 严格匹配的字段标量，不隐式转换。 */
  value: string | number | boolean
  /** 类别显示文字。 */
  label: string
  /** 普通节点徽标的语义色，命中的业务徽标规则优先。 */
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}>

/** 一个补充节点视图；直接消费rows，主键须与其他节点来源唯一。 */
export type GraphNodeSource = Readonly<{
  /** 本次运行实例的完整数据视图绑定。 */
  dataViewKey: string
  /** 标题字段，缺省继承主节点配置。 */
  labelField?: string
  /** 描述字段，缺省继承主节点配置。 */
  descriptionField?: string
  /** 类别文字字段，缺省继承主节点配置。 */
  nodeCaptionField?: string
  /** 类别显示选项，省略继承主节点配置；空数组保持字段原文。 */
  nodeCaptionOptions?: readonly GraphCaptionOption[]
}>

/** r-graph：模型节点和关系边分别绑定视图，不接受业务rows数组。 */
export type RGraphProps = SparkNodeProps & Pick<SparkTableModelProps, 'dataViewKey'> & {
  /** 标准容器工具栏；子组件继承节点DataView，关系动作可显式绑定关系视图。 */
  toolbar?: RToolbarProps
  /** 节点取rows或selectedRows；默认rows。 */
  dataMember?: 'rows' | 'selectedRows'
  /** 多个补充节点来源，分别消费绑定视图的rows和字段权限；省略为空，重复绑定同一视图只呈现一次。 */
  additionalNodeSources?: readonly GraphNodeSource[]
  /** 关系视图的完整绑定；省略时只呈现节点。 */
  edgeDataViewKey?: string
  /** 补充关系视图的完整绑定，消费rows并复用端点字段/映射及布局。主键须与主关系视图唯一；省略时不继承节点视图。 */
  additionalEdgeDataViewKey?: string
  /** 关系视图消费成员；默认rows。 */
  edgeDataMember?: 'rows' | 'selectedRows'
  /** 节点标题字段，经DataView.fieldAccess读取。 */
  labelField: string
  /** 节点描述字段，经DataView.fieldAccess读取。 */
  descriptionField?: string
  /** 节点顶部的类别文字字段，复用字段读取/脱敏权限。 */
  nodeCaptionField?: string
  /** 对可读类别字段按标量严格匹配；无匹配保持原文，隐藏/脱敏字段不参与映射。 */
  nodeCaptionOptions?: readonly GraphCaptionOption[]
  /** 未命中徽标规则时显示的文字；仅在规则引用字段均存在且可读时使用，颜色取类别选项或info。省略不显示。 */
  nodeDefaultBadge?: string
  /** 按声明顺序匹配首个可读字段的严格值；仅决定节点徽标和颜色，不产生权限。 */
  nodeBadgeRules?: ReadonlyArray<Readonly<{
    /** 当前节点视图字段。 */
    field: string
    /** 与正式行严格比较的标量，不隐式转换。 */
    value: string | number | boolean
    /** 命中规则后的徽标文字。 */
    label: string
    /** 标准语义色，缺省info。 */
    tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  }>>
  /** 显示放大、缩小和适应画布控件，默认true；只改变当前视口。 */
  viewportControls?: boolean
  /** 边记录的起点字段，默认source。 */
  edgeSourceField?: string
  /** 边记录的终点字段，默认target。 */
  edgeTargetField?: string
  /** 端点引用名到节点主键的显式映射；配置后不存在的项拒绝猜测。 */
  edgeNodeKeys?: Readonly<Record<string, string | number>>
  /** 节点主键到中心坐标的布局。缺失位置只在画布临时排列，不自动保存。 */
  nodePositions?: Readonly<Record<string, Readonly<{x: number; y: number}>>>
  /** 仅在画布隐藏这些原始主键及其关联边，默认全部呈现；不过滤DataView、不改变选择或删除记录/布局。仅匹配身份可读且唯一的节点，不能用来屏蔽无效端点诊断。 */
  hiddenNodeKeys?: ReadonlyArray<string | number>
  /** 关系主键到显式折线路径；只是布局，不定义或覆盖关系端点。 */
  edgePaths?: Readonly<Record<string, readonly GraphCanvasPoint[]>>
  /** 允许拖动的节点主键；默认全部只读。页面按布局配置身份决定，不等于模型修改授权。 */
  draggableKeys?: ReadonlyArray<string | number>
  /** 拖动结束后的主键和中心坐标；页面接受后更新nodePositions，组件不保存或修改节点记录。 */
  onNodeMove?: (event: GraphNodeMove) => void
  /** 整图对齐事件；沿布局owner一次预检全部节点并更新nodePositions/edgePaths，失败同步取消。不等于模型写权限或保存。 */
  onArrange?: (event: GraphArrange) => void
  /** 允许作为新连线端点的节点主键；默认关闭。仅开放交互，不代表关系新增已获授权。 */
  connectableKeys?: ReadonlyArray<string | number>
  /** 连线确认的节点主键；页面决定打开已有关系或创建草稿，组件不自动添加边或推导条件。 */
  onConnect?: (event: Readonly<{source: string | number; target: string | number}>) => void
  /** 外部对象导航同步的高亮目标；null明确清空。 */
  current?: Readonly<{kind: 'node' | 'edge'; id: string | number}> | null
  /** 阻止对象选择、拖动和连线，不改变后端数据权限。 */
  disabled?: boolean
  /** 对象选择/双击事件；仅携带身份，不透传未检查权限的原始行。 */
  onSelect?: (event: GraphSelection) => void
}
