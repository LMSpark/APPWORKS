/**
 * @module app:views/features/data-platform/structured-config/data-code/ui/use-code-node-rule-dialog
 * 日期/父编码弹窗的领域编排；正式值及编辑覆盖由原DataView持有，取消复用原生字段检查点。
 */
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {buildDataViewKey, parseDataViewKey, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {isJsonObject, parseJsonDocument} from '@spark-appworks/spark-json-document'
import {PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'
import {codeNodeTypeLabel} from '@/lowcode/resources/structured-config/data-code/design-ops'

type RuleTarget = Readonly<{dataViewKey: string; nodeId: string | number; busTableRowid: string}>
/** @param props 本次原节点绑定及业务表身份。 @param kind 规则类型。 @param close 释放弹窗，不提交后端。 */
export function useCodeNodeRuleDialog(props: RuleTarget, kind: 'time' | 'parent', close: () => void) {
  const {sparkConsume} = useSparkComponent({type: `${kind}-code-node-rule`})
  const runtime = sparkConsume(PAGE_RUNTIME), target = {...props}
  const loading = ref(true), ready = ref(false), pendingInput = ref(false), closing = ref(false), error = ref('')
  let active = true, generation = 0, view: DataView | undefined
  let checkpoint: ReturnType<DataView['createEditingCheckpoint']> | undefined
  const scope = parseDataViewKey(target.dataViewKey)?.scope
  const fieldOptionsKey = scope ? buildDataViewKey('Base_TblField', 'default', scope) : ''
  const parentOptionsKey = scope ? buildDataViewKey('Base_CodeDesign', 'parents', scope) : ''
  const confirmDisabled = computed(() => loading.value || !ready.value || pendingInput.value || closing.value)
  function current(): DataRow {
    if (!active || props.dataViewKey !== target.dataViewKey || props.nodeId !== target.nodeId || props.busTableRowid !== target.busTableRowid
      || !view || view.destroyed || runtime?.resolveView(target.dataViewKey) !== view || !view.currentRow || view.getPkKey(view.currentRow) !== target.nodeId) {
      throw new Error('编码段目标已改变，请重新打开规则')
    }
    const row = view.currentRow
    if (view.hasUnconfirmedSave || view.dataSet?.getView('Base_CodeDesign')?.hasUnconfirmedSave) throw new Error('请先核验保存结果')
    for (const field of ['CodeNodeDesignJson', 'ParameterName']) {
      const access = view.fieldAccess(row, field)
      if (access.read !== 'visible' || access.write !== 'allowed') throw new Error('当前编码段规则不可读写')
    }
    return view.getEditingRow(target.nodeId) ?? row
  }
  function ruleObject(row: DataRow) {
    const raw = row['CodeNodeDesignJson']
    if (raw === undefined || raw === null || raw === '') return {}
    if (typeof raw !== 'string') throw new Error('编码节点规则必须是JSON文本')
    try {const parsed = parseJsonDocument(raw); if (isJsonObject(parsed)) return parsed}
    catch {throw new Error('编码节点规则JSON无效，请先纠正')}
    throw new Error('编码节点规则必须是JSON对象')
  }
  function text(value: unknown): string {
    if (value === undefined || value === null) return ''
    if (typeof value !== 'string') throw new Error('规则成员必须是字符串')
    return value.trim()
  }
  function known(options: DataView, field: string, value: string): boolean {
    return options.rows.some(row => options.fieldAccess(row, field).read === 'visible' && row[field] === value)
  }
  async function open(): Promise<void> {
    const own = ++generation
    try {
      if (!scope || parseDataViewKey(target.dataViewKey)?.tableName !== 'Base_CodeNodeDesign') throw new Error('规则缺少完整节点视图绑定')
      view = runtime?.resolveView(target.dataViewKey) ?? undefined
      if (!view?.setCurrentRowById(target.nodeId)) throw new Error('当前编码段不存在')
      const row = current(), dataSet = view.dataSet
      if (!dataSet || view.fieldAccess(row, 'NodeType').read !== 'visible') throw new Error('编码段类型不可读')
      const label = codeNodeTypeLabel(dataSet, row['NodeType'])
      if (kind === 'time' ? !label.includes('时间字符串') : label !== '父编码串') throw new Error('当前编码段类型与规则不匹配')
      const object = ruleObject(row)
      if (!target.busTableRowid) throw new Error('当前设计未选择业务表')
      checkpoint = view.createEditingCheckpoint(target.nodeId, ['CodeNodeDesignJson', 'ParameterName'])
      const initial = kind === 'time' ? {...object, DateFormat: text(object['DateFormat']) || 'yyyyMMDD', RefBusTableField: text(object['RefBusTableField'])} : object
      if (row['CodeNodeDesignJson'] !== JSON.stringify(initial)) view.updateEditingValue(target.nodeId, 'CodeNodeDesignJson', JSON.stringify(initial))
      const fields = dataSet.getView('Base_TblField')
      if (!fields) throw new Error('业务字段选项视图缺失')
      fields.queryContext = {...fields.queryContext, busTableRowid: target.busTableRowid}
      await fields.refresh()
      if (fields.loadingError) throw fields.loadingError
      if (kind === 'parent') {
        const parents = dataSet.getView('Base_CodeDesign', 'parents')
        if (!parents) throw new Error('父编码选项视图缺失')
        await parents.refresh(); if (parents.loadingError) throw parents.loadingError
      }
      if (active && own === generation) {current(); ready.value = true}
    } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
    finally {if (active && own === generation) loading.value = false}
  }
  function guardWrite(): void {current()}
  function confirm(): void {
    if (confirmDisabled.value || !view) return
    try {
      const row = current(), object = ruleObject(row), fields = view.dataSet?.getView('Base_TblField')
      if (!fields) throw new Error('业务字段选项视图缺失')
      let parameter = text(row['ParameterName'])
      if (kind === 'time') {
        const format = text(object['DateFormat']) || 'yyyyMMDD', field = text(object['RefBusTableField'])
        if (field && !known(fields, 'enname', field)) throw new Error('业务表字段不在当前可读目录中，请选择或清除')
        object['DateFormat'] = format; object['RefBusTableField'] = field; parameter = format
      } else {
        const parent = text(object['RefCodeId']), field = text(object['parentCodeBizField']), parents = view.dataSet?.getView('Base_CodeDesign', 'parents')
        if (!parameter) throw new Error('请输入参数名称')
        if (!parent || !parents || !known(parents, 'rowid', parent)) throw new Error('请选择当前应用下的父编码串')
        if (!field || !known(fields, 'enname', field)) throw new Error('请选择父编码业务表关联字段')
        object['RefCodeId'] = parent; object['parentCodeBizField'] = field
      }
      view.updateEditingValue(target.nodeId, 'CodeNodeDesignJson', JSON.stringify(object))
      view.updateEditingValue(target.nodeId, 'ParameterName', parameter)
      checkpoint?.release(); checkpoint = undefined; ready.value = false; close()
    } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  }
  async function cancel(): Promise<void> {
    if (closing.value) return
    closing.value = true; ready.value = false; generation++
    await nextTick()
    try {checkpoint?.restore(); checkpoint = undefined; close()}
    catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
    finally {closing.value = false}
  }
  watch(() => [props.dataViewKey, props.nodeId, props.busTableRowid], (_value, previous) => {
    if (!previous) {void open(); return}
    generation++; ready.value = false; error.value = '规则目标已改变，请重新打开'
  }, {immediate: true, flush: 'sync'})
  onBeforeUnmount(() => {active = false; generation++; try {checkpoint?.restore()} catch {checkpoint?.release()} checkpoint = undefined})
  return {loading, ready, pendingInput, closing, error, confirmDisabled, fieldOptionsKey, parentOptionsKey, guardWrite, confirm, cancel}
}
