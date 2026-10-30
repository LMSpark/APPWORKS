/**
 * @module @spark-appworks/spark-data:node-tree/index
 * 职责：提供数据层 node-tree 能力，围绕 模块入口、副作用注册或内部组合逻辑 描述 DataSet、DataTable、DataView、策略委托或数据绑定键。
 * 边界：保持框架无关，只处理数据模型、校验和本地策略，不依赖 Vue、路由或 Element Plus。
 * AI用途：生成页面数据绑定、DataViewKey 或数据策略调用时，用本模块确认 node-tree/index 的数据语义。
 */
export type {
  SparkNode,
  SparkNodeChildren,
} from './spark-node'

export {
  SPARK_NODE_STRUCT_KEYS,
  isSparkNode,
  normalizeSparkNode,
} from './spark-node'

export {
  getSparkNodeChildren,
  nodeId,
  nodeInputProp,
  nodeInputProps,
} from './spark-node'

export type {
  SparkNodeFindByTypeMatch,
  SparkNodeFindByTypeParams,
  SparkNodeFindByTypeResult,
  SparkNodeLocation,
  SparkNodeTreeChildrenParams,
  SparkNodeTreeLookupParams,
} from './spark-node-tree'

export type {
  SparkNodeAddResult,
  SparkNodeMoveResult,
  SparkNodeRemoveResult,
  SparkNodeReplaceResult,
  SparkNodeSetPropsResult,
} from './spark-node-tree'

export type {
  SparkNodeAddNodesResult,
  SparkNodeRemoveNodesResult,
  SparkNodeReplaceNodesResult,
  SparkNodeSetPropsBatchResult,
} from './spark-node-tree'

export type {
  SparkNodeTreeAddNodesParams,
  SparkNodeTreeAddParams,
  SparkNodeTreeMoveParams,
  SparkNodeTreeRemoveNodesParams,
  SparkNodeTreeRemoveParams,
  SparkNodeTreeReplaceNodesParams,
  SparkNodeTreeReplaceParams,
  SparkNodeTreeSetPropsParams,
} from './spark-node-tree'

export type {
  SparkNodeTreeReplaceNodesItem,
  SparkNodeTreeSetPropsBatchItem,
  SparkNodeTreeSetPropsBatchParams,
} from './spark-node-tree'

export {
  SPARK_PAGE_NODE_TYPE,
  SPARK_PAGE_ROOT_ID,
  SparkNodeTree,
  visitSparkNodeDataViewBindings,
} from './spark-node-tree'

export type {
  SparkNodeTreeFromJsonOptions,
  SparkNodeTreeJsonInput,
  SparkNodeTreeMethodKey,
  SparkNodeTreeRootParams,
  SparkNodeTreeRuleJsonInput,
} from './spark-node-tree'
