<!--
@module @spark-appworks/spark-component:components/containers/data-views/RendererGraph/RendererGraph
职责：绑定节点与关系DataView，呈现图形及可取消的对象选择。
边界：消费字段权限和视图状态，不推导模型关系，不保存业务记录。
AI用途：绑定节点与关系视图，通过字段名和显式端点映射恢复关系图业务入口。
-->
<template>
  <div v-if="isVisible" :class="['renderer-graph', `renderer-graph--${toolbarPositionValue}`]">
    <div v-if="toolbarConfig" :class="['renderer-graph-toolbar', toolbarClassValue]">
      <SparkComponentRenderer :config="toolbarConfig" />
    </div>
    <div class="renderer-graph-body">
    <p v-for="message in projection.messages" :key="message" role="alert">{{ message }}</p>
    <GraphCanvas ref="canvas" :nodes="projection.nodes" :edges="projection.edges" :context-key="contextKey"
      :viewport-controls="props.viewportControls"
      :disabled="props.disabled === true" :selected-id="selectedId" :draggable-ids="draggableIds"
      :connectable="connectableIds.length > 0" :connectable-ids="connectableIds" @select="select" @move="move" @connect="connect" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 关系图数据容器，绑定节点/关系DataView并呈现可取消的对象选择。
 * @category container
 * @binding dataViewKey-driven
 * @notes 组件读取当次字段权限，不修改模型关系或自动持久化坐标。
 */
import {computed, effectScope, nextTick, onBeforeUnmount, ref, shallowRef, toRef, watch} from 'vue'
import type {DataRow, DataView} from '@spark-appworks/spark-data'
import {DATA_SOURCE, SparkComponentRenderer, useSparkPageComponent} from '../../../internal'
import {useContainerToolbar} from '../../runtime/container-ui'
import {useContainerDataSource} from '../view-data-source'
import GraphCanvas from './GraphCanvas.vue'
import type {GraphCanvasNode, GraphCanvasEdge, GraphCanvasPoint} from './GraphCanvas.types'
import type {GraphSelection, GraphArrange, GraphNodeSource, RendererGraphApi, RGraphProps} from './RendererGraph.props'
import {GraphLayout} from './GraphLayout'

const props = withDefaults(defineProps<RGraphProps>(), {type: 'r-graph', dataMember: 'rows', edgeDataMember: 'rows', edgeSourceField: 'source', edgeTargetField: 'target', viewportControls: true})
const {isVisible, sparkConsume, sparkProvide, sparkRemove} = useSparkPageComponent(props)
const {toolbarConfig, toolbarPositionValue, toolbarClassValue} = useContainerToolbar({toolbarNode: () => props.toolbar})
const nodes = useContainerDataSource({dataViewKey: toRef(props, 'dataViewKey'), sparkConsume})
// Each dynamic binding owns the common event bridge in a disposable scope.
const additionalNodes = shallowRef<Array<{config: GraphNodeSource; state: ReturnType<typeof useContainerDataSource>}>>([])
let nodeScope = effectScope(true)
watch(() => JSON.stringify(props.additionalNodeSources ?? []), () => {
  const sources = props.additionalNodeSources
  nodeScope.stop(); nodeScope = effectScope(true)
  additionalNodes.value = nodeScope.run(() => (sources ?? []).map(config => ({config,
    state: useContainerDataSource({dataViewKey: () => config.dataViewKey, sparkConsume}),
  }))) ?? []
}, {immediate: true, flush: 'sync'})
const edges = useContainerDataSource({dataViewKey: toRef(props, 'edgeDataViewKey'), sparkConsume})
const additionalEdges = useContainerDataSource({dataViewKey: toRef(props, 'additionalEdgeDataViewKey'), sparkConsume})
const bindingRevision = ref(0)
const selectedView = shallowRef<DataView | null>(null)
let active = true
const canvas = ref<InstanceType<typeof GraphCanvas>>()
onBeforeUnmount(() => {active = false; nodeScope.stop()})
watch([nodes.resolvedView, () => additionalNodes.value.map(source => source.state.resolvedView.value), edges.resolvedView, additionalEdges.resolvedView], ([view]) => {
  bindingRevision.value++
  selectedView.value = view
  if (view) sparkProvide(DATA_SOURCE, view)
  else sparkRemove(DATA_SOURCE)
}, {immediate: true, flush: 'sync'})
// A completed drag belongs to the rows and authorization that started it.
watch([nodes.rows, () => additionalNodes.value.map(({state}) => [state.rows.value, state.requestState.value]), edges.rows, nodes.requestState, edges.requestState,
  additionalEdges.rows, additionalEdges.requestState, () => props.additionalEdgeDataViewKey,
  () => props.dataMember, () => props.edgeDataMember,
  () => props.dataMember === 'selectedRows' ? nodes.selectedRows.value : null,
  () => props.edgeDataMember === 'selectedRows' ? edges.selectedRows.value : null], () => {bindingRevision.value++}, {flush: 'sync'})
watch(() => JSON.stringify([props.nodePositions, props.hiddenNodeKeys, props.edgePaths, props.edgeNodeKeys, props.edgeSourceField, props.edgeTargetField]),
  () => {bindingRevision.value++}, {flush: 'sync'})
const contextKey = computed(() => String(bindingRevision.value))
// VueFlow embeds this internal identity in a quoted DOM selector; retain raw keys only in the lookup map.
function graphId(kind: 'node' | 'edge', key: string | number): string {return `${contextKey.value}:${kind}:${encodeURIComponent(JSON.stringify(key))}`}
function visible(view: DataView, row: DataRow, field: string): boolean {return view.fieldAccess(row, field).read === 'visible'}
function caption(view: DataView, row: DataRow, field: string | undefined): string {
  if (!field) return ''
  const access = view.fieldAccess(row, field).read
  if (access !== 'visible') return access === 'masked' ? '***' : ''
  const value = row[field]
  return value === undefined || value === null ? '' : String(value)
}
function identity(view: DataView, row: DataRow): string | number | undefined {
  const columns = view.columns.filter(column => column.isPrimaryKey)
  if ((columns.length ? columns.map(column => column.name) : [view.primaryKey]).some(field => !visible(view, row, field))) return undefined
  return view.getPkKey(row)
}
const projection = computed(() => {
  const nodeRows = props.dataMember === 'selectedRows' ? nodes.selectedRows.value : nodes.rows.value
  const edgeRows = props.edgeDataMember === 'selectedRows' ? edges.selectedRows.value : edges.rows.value
  const nodeView = nodes.resolvedView.value, edgeView = props.edgeDataViewKey ? edges.resolvedView.value : undefined
  const result: {nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[]; messages: string[];
    keys: Map<string, {kind: 'node' | 'edge'; id: string | number; view: DataView}>} = {nodes: [], edges: [], messages: [], keys: new Map()}
  if (!nodeView || nodeView.destroyed) return result
  const nodeIds = new Map<string | number, string>()
  const hiddenKeys = new Set(props.hiddenNodeKeys), hiddenNodes = new Set<string | number>()
  const visited = new Set<DataView>([nodeView])
  const entries = [...nodeRows.map(row => ({row, view: nodeView, config: props})),
    ...additionalNodes.value.flatMap(({state, config}) => {
      const view = state.resolvedView.value
      if (!view || view.destroyed || visited.has(view)) return []
      visited.add(view)
      return state.rows.value.map(row => ({row, view, config: {labelField: config.labelField ?? props.labelField,
        descriptionField: config.descriptionField ?? props.descriptionField, nodeCaptionField: config.nodeCaptionField ?? props.nodeCaptionField,
        nodeCaptionOptions: config.nodeCaptionOptions ?? props.nodeCaptionOptions}}))
    })]
  const counts = new Map<string | number, number>()
  for (const {row, view} of entries) {const key = identity(view, row); if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1)}
  for (const [index, {row, view, config}] of entries.entries()) {
    const key = identity(view, row)
    if (key === undefined) {result.messages.push('存在身份不可读的节点，未在画布呈现。'); continue}
    const id = graphId('node', key)
    if (counts.get(key) !== 1) {result.messages.push('节点身份重复，画布不能唯一定位。'); continue}
    if (hiddenKeys.has(key)) {hiddenNodes.add(key); continue}
    nodeIds.set(key, id)
    const position = props.nodePositions?.[String(key)]
    const badge = props.nodeBadgeRules?.find(rule => visible(view, row, rule.field) && row[rule.field] === rule.value)
    const option = config.nodeCaptionField && visible(view, row, config.nodeCaptionField)
      ? config.nodeCaptionOptions?.find(item => item.value === row[config.nodeCaptionField!]) : undefined
    const defaultBadge = props.nodeDefaultBadge && (props.nodeBadgeRules ?? []).every(rule =>
      view.columns.some(column => column.name === rule.field) && visible(view, row, rule.field))
      ? {label: props.nodeDefaultBadge, tone: option?.tone ?? 'info' as const} : undefined
    result.nodes.push({id, title: caption(view, row, config.labelField), description: caption(view, row, config.descriptionField),
      caption: option?.label ?? caption(view, row, config.nodeCaptionField),
      ...(badge ? {badge: {label: badge.label, tone: badge.tone ?? 'info'}} : defaultBadge ? {badge: defaultBadge} : {}),
      x: position && Number.isFinite(position.x) ? position.x : 150 + index % 3 * 310,
      y: position && Number.isFinite(position.y) ? position.y : 90 + Math.floor(index / 3) * 180})
    result.keys.set(id, {kind: 'node', id: key, view})
  }
  const supplementalEdges = props.additionalEdgeDataViewKey ? additionalEdges.resolvedView.value : undefined
  const edgeEntries = [...edgeView && !edgeView.destroyed ? edgeRows.map(row => ({row, view: edgeView})) : [],
    ...supplementalEdges && !supplementalEdges.destroyed && supplementalEdges !== edgeView
      ? additionalEdges.rows.value.map(row => ({row, view: supplementalEdges})) : []]
  const edgeCounts = new Map<string | number, number>()
  for (const {row, view} of edgeEntries) {const key = identity(view, row); if (key !== undefined) edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1)}
  for (const {row, view} of edgeEntries) {
    const key = identity(view, row)
    if (key === undefined || !visible(view, row, props.edgeSourceField) || !visible(view, row, props.edgeTargetField)) {
      result.messages.push('存在身份或端点不可读的关系，未在画布呈现。'); continue
    }
    if (edgeCounts.get(key) !== 1) {result.messages.push('关系身份重复，画布不能唯一定位。'); continue}
    const endpoint = (field: string) => {
      const value = row[field]
      if (typeof value !== 'string' && typeof value !== 'number') return undefined
      const mapped = props.edgeNodeKeys === undefined ? value
        : Object.hasOwn(props.edgeNodeKeys, String(value)) ? props.edgeNodeKeys[String(value)] : undefined
      return mapped
    }
    const sourceKey = endpoint(props.edgeSourceField), targetKey = endpoint(props.edgeTargetField)
    if (sourceKey === undefined || targetKey === undefined
      || !nodeIds.has(sourceKey) && !hiddenNodes.has(sourceKey) || !nodeIds.has(targetKey) && !hiddenNodes.has(targetKey)) {
      result.messages.push('存在端点未唯一绑定到可读节点的关系，请在关系配置中核查。'); continue
    }
    if (hiddenNodes.has(sourceKey) || hiddenNodes.has(targetKey)) continue
    const source = nodeIds.get(sourceKey)!, target = nodeIds.get(targetKey)!
    const id = graphId('edge', key)
    if (result.keys.has(id)) {result.messages.push('关系身份重复，画布不能唯一定位。'); continue}
    const path = props.edgePaths?.[String(key)]
    if (path !== undefined && (path.length < 2 || path.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) {
      result.messages.push('存在无效的关系折线路径，请核查布局配置。'); continue
    }
    result.edges.push({id, source, target, ...(path ? {pointsList: path} : {})})
    result.keys.set(id, {kind: 'edge', id: key, view})
  }
  result.messages = [...new Set(result.messages)]
  return result
})
const selectedId = computed(() => {
  const sources = [nodes, ...additionalNodes.value.map(source => source.state), edges, additionalEdges]
  for (const source of sources) source.currentRow.value
  if (props.current !== undefined) return props.current ? graphId(props.current.kind, props.current.id) : undefined
  const source = sources.find(item => item.resolvedView.value === selectedView.value) ?? nodes
  const view = source.resolvedView.value, row = source.currentRow.value
  const key = view && row ? identity(view, row) : undefined
  return key === undefined ? undefined : graphId(source === edges || source === additionalEdges ? 'edge' : 'node', key)
})
const draggableIds = computed(() => [...projection.value.keys].flatMap(([id, target]) =>
  target.kind === 'node' && props.draggableKeys?.includes(target.id) ? [id] : []))
const connectableIds = computed(() => [...projection.value.keys].flatMap(([id, target]) =>
  target.kind === 'node' && props.connectableKeys?.includes(target.id) ? [id] : []))
function connect(event: {contextKey: string; source: string; target: string}): void {
  if (!active || props.disabled || event.contextKey !== contextKey.value) return
  const source = projection.value.keys.get(event.source), target = projection.value.keys.get(event.target)
  if (!source || !target || source.kind !== 'node' || target.kind !== 'node' || source.view.destroyed || target.view.destroyed
    || !connectableIds.value.includes(event.source) || !connectableIds.value.includes(event.target)) return
  props.onConnect?.({source: source.id, target: target.id})
}
function move(event: {contextKey: string; id: string; x: number; y: number; edges: {id: string; pointsList: GraphCanvasPoint[]}[]}): void {
  if (!active || props.disabled || event.contextKey !== contextKey.value || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return
  const target = projection.value.keys.get(event.id)
  if (!target || target.kind !== 'node' || target.view.destroyed || !draggableIds.value.includes(event.id)) return
  const moved = event.edges.flatMap(edge => {
    const source = projection.value.keys.get(edge.id)
    return source?.kind === 'edge' && !source.view.destroyed ? [{id: source.id, pointsList: edge.pointsList}] : []
  })
  if (moved.length !== event.edges.length) return
  props.onNodeMove?.({id: target.id, x: event.x, y: event.y, edges: moved})
}
function select(event: {contextKey: string; type: 'node' | 'edge'; id: string; open: boolean}): void {
  if (!active || props.disabled || event.contextKey !== contextKey.value) return
  const target = projection.value.keys.get(event.id)
  if (!target || target.kind !== event.type || target.view.destroyed) return
  const control = {cancel: false}
  const selection: GraphSelection = {kind: target.kind, id: target.id, open: event.open, control}
  props.onSelect?.(selection)
  if (control.cancel || target.view.destroyed || event.contextKey !== contextKey.value) return
  target.view.setCurrentRowById(target.id)
  selectedView.value = target.view
}
function viewport(action: 'selectCurrent' | 'center' | 'fitView' | 'zoomIn' | 'zoomOut'): Promise<boolean> {
  return active && isVisible.value && !props.disabled && canvas.value ? canvas.value[action]() : Promise.resolve(false)
}
async function selectCurrent(): Promise<boolean> {
  const view = nodes.resolvedView.value, id = selectedId.value, context = contextKey.value
  if (!view || view.destroyed) return false
  const target = id === undefined ? undefined : projection.value.keys.get(id)
  if (id !== undefined && (!target || target.view.destroyed)) return false
  await nextTick()
  if (!active || view.destroyed || target?.view.destroyed || context !== contextKey.value || id !== selectedId.value) return false
  return viewport('selectCurrent')
}
async function arrange(): Promise<boolean> {
  const current = projection.value, width = canvas.value?.width() ?? 0
  if (!active || !isVisible.value || props.disabled || !props.onArrange || width <= 0 || !current.nodes.length || current.messages.length
    || [...current.keys.values()].some(target => target.view.destroyed)
    || current.nodes.some(node => !draggableIds.value.includes(node.id))) return false
  const positions = GraphLayout.grid(current.nodes, width)
  const next = new Map(positions.map(node => [node.id, node]))
  const event: GraphArrange = {nodes: positions.map(node => ({...node, id: current.keys.get(String(node.id))!.id})),
    edges: current.edges.filter(edge => edge.pointsList).map(edge => {
      const source = next.get(edge.source)!, target = next.get(edge.target)!
      const start = {x: source.x + 116, y: source.y}, end = {x: target.x - 116, y: target.y}, middleX = (start.x + end.x) / 2
      return {id: current.keys.get(edge.id)!.id, pointsList: [start, {x: middleX, y: start.y}, {x: middleX, y: end.y}, end]}
    }), control: {cancel: false}}
  props.onArrange(event)
  if (event.control.cancel) return false
  await nextTick()
  // Fit only an accepted projection on the same bound views. A navigation or
  // a newer edit must not move the new graph's viewport.
  const accepted = projection.value
  const sameNodes = accepted.nodes.length === current.nodes.length && accepted.nodes.every(node => {
    const key = accepted.keys.get(node.id)!
    return [...current.keys.values()].some(item => item.kind === 'node' && item.id === key.id && item.view === key.view)
      && event.nodes.some(item => item.id === key.id && item.x === node.x && item.y === node.y)
  })
  if (active && sameNodes) await viewport('fitView')
  return true
}
function center(): Promise<boolean> {return viewport('center')}
function fitView(): Promise<boolean> {return viewport('fitView')}
function zoomIn(): Promise<boolean> {return viewport('zoomIn')}
function zoomOut(): Promise<boolean> {return viewport('zoomOut')}
defineExpose<RendererGraphApi>({selectCurrent, center, fitView, zoomIn, zoomOut, arrange})
</script>

<style scoped>
.renderer-graph {display: flex; flex-direction: column; min-height: 420px; height: 100%;}
.renderer-graph--bottom {flex-direction: column-reverse;}
.renderer-graph--left {flex-direction: row;}
.renderer-graph--right {flex-direction: row-reverse;}
.renderer-graph-toolbar {flex: 0 0 auto; padding: 0 0 8px;}
.renderer-graph-body {display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 420px;}
.renderer-graph-body > .graph-canvas {flex: 1; min-height: 420px;}
[role="alert"] {color: var(--el-color-warning); margin: 0 0 .5rem;}
</style>
