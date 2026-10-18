/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererGraph/GraphCanvas.types
 * 职责：声明标准关系图内部的绘制投影。
 * 边界：只含经权限检查后的文字、身份与坐标；没有业务查询或保存能力。
 * AI用途：业务页绑定RGraphProps，内部画布不作为业务数据入口。
 */
/** 画布中的坐标点，单位为像素。 */
export type GraphCanvasPoint = Readonly<{
  /** 水平坐标。 */
  x: number
  /** 垂直坐标。 */
  y: number
}>

/** 已完成身份及字段权限检查的节点投影。 */
export type GraphCanvasNode = Readonly<{
  /** 当前图内唯一的绘图身份，与业务主键通过上层映射关联。 */
  id: string
  /** 节点中心的水平坐标。 */
  x: number
  /** 节点中心的垂直坐标。 */
  y: number
  /** 可读的标题文本；上层已处理隐藏和脱敏。 */
  title: string
  /** 可读的说明文本；不传未授权的原始行。 */
  description: string
  /** 经权限检查的类别文字。 */
  caption?: string
  /** 经可读字段规则匹配得到的徽标。 */
  badge?: Readonly<{
    /** 徽标文字。 */
    label: string
    /** 标准语义色。 */
    tone: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  }>
}>

/** 指向图内节点身份的关系绘制投影。 */
export type GraphCanvasEdge = Readonly<{
  /** 当前图内唯一的关系绘图身份。 */
  id: string
  /** 起点节点绘图身份。 */
  source: string
  /** 终点节点绘图身份。 */
  target: string
  /** 显式折线路径；缺省时由画布计算连线。 */
  pointsList?: readonly GraphCanvasPoint[]
}>

/** 内部纯绘图合同；业务页通过RendererGraph绑定DataView。 */
export type GraphCanvasProps = Readonly<{
  /** 已授权的节点绘制投影。 */
  nodes: readonly GraphCanvasNode[]
  /** 已授权且端点可解析的关系投影。 */
  edges: readonly GraphCanvasEdge[]
  /** 是否允许拉出新连线；默认允许，标准查看图显式关闭。 */
  connectable?: boolean | undefined
  /** 可连接的节点身份；缺省沿connectable开放全部，空数组关闭全部端口。 */
  connectableIds?: readonly string[] | undefined
  /** 调用方提供的投影版本，事件原样返回以拒绝过期交互。 */
  contextKey?: string | undefined
  /** 停用全部选择、拖动和连线交互。 */
  disabled?: boolean | undefined
  /** 外部选中的节点或关系绘图身份。 */
  selectedId?: string | undefined
  /** 可拖动节点的显式集合；缺省允许全部，空数组禁止拖动。 */
  draggableIds?: readonly string[] | undefined
  /** 是否显示只操作视口的缩放与适应控件，默认true。 */
  viewportControls?: boolean | undefined
}>
