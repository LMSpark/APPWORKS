export type DataSpaceDesignGraphPoint = Readonly<{
  x: number
  y: number
}>

export type DataSpaceDesignGraphNode = Readonly<{
  id: string
  x: number
  y: number
  title: string
  description: string
}>

export type DataSpaceDesignGraphEdge = Readonly<{
  id: string
  source: string
  target: string
  pointsList?: readonly DataSpaceDesignGraphPoint[]
}>

export type DataSpaceDesignGraphProps = Readonly<{
  nodes: readonly DataSpaceDesignGraphNode[]
  edges: readonly DataSpaceDesignGraphEdge[]
  contextKey?: string
  disabled?: boolean
  selectedId?: string
  draggableIds?: readonly string[]
}>
