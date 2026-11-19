<!--
@module app:views/features/integration/api-management/ui/interface-list/interface-json-import-dialog
职责：按原“JSON输入”对话框整体替换当前接口的请求体：Body/Json直接替换；Body/FormData接受对象数组并规范为原四成员行。
边界：输入文本验证通过后才写入当前接口的编辑覆盖，由接口“保存”统一提交。
-->
<template>
  <RendererDialog v-bind="dialogRule.props" :footer="footerConfig" :model-value="true" @update:model-value="cancel">
    <SparkComponentRenderer :config="editorConfig" />
    <SparkComponentRenderer v-if="error" :config="errorConfig" />
  </RendererDialog>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import {PAGE_RUNTIME, useSparkComponent, RendererDialog, SparkComponentRenderer} from '@spark-appworks/spark-component'
import {getSparkNodeChildren,nodeId,type SparkNode} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {INTERFACE_KEYS} from './interface-list-workspace'
const props = defineProps<{dialogRule:SparkNode;target: 'json' | 'form'}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'interface-json-import-dialog'})
const runtime = sparkConsume(PAGE_RUNTIME)
const interfaces = runtime?.resolveView(INTERFACE_KEYS.interfaces)
const row = interfaces?.currentRow, id = row && interfaces ? interfaces.getPkKey(row) : undefined
if (!interfaces || !row || id === undefined) throw new Error('JSON输入缺少当前接口')
const view = interfaces, rowId = id
const field = 'BodyParamJsonStr'
const original = view.fieldAccess(row, field).read === 'visible' ? String(view.getEditingRow(rowId)?.[field] ?? '') : ''
const input = ref(original)
const error = ref('')
const [editorRule,errorRule]=getSparkNodeChildren(props.dialogRule.children)
if(!editorRule||!errorRule)throw Error('JSON 输入弹窗配置不完整')
const editorConfig=computed(()=>({
 ...editorRule,
 props:{...editorRule.props,...(props.target==='form'?{label:'请输入 JSON 数组'}:{}),
  modelValue:input.value,'onUpdate:modelValue':(value:string)=>{input.value=value}},
}))
const errorConfig=computed(()=>({...errorRule,props:{...errorRule.props,title:error.value}}))
const footer=props.dialogRule.props?.['footer']
if(!isRecord(footer)||!Array.isArray(footer['children']))throw Error('JSON 输入弹窗缺少操作配置')
const footerActions: Readonly<Record<string,()=>void>>={'json-import-cancel':cancel,'json-import-confirm':confirm}
const footerConfig={...footer,children:getSparkNodeChildren(footer['children']).map(node=>({
 ...node,props:{...node.props,onClick:footerActions[nodeId(node)??'']},
}))}

const text = (value: unknown, fallback: string) => typeof value === 'string' ? value : value === undefined || value === null ? fallback : JSON.stringify(value)
function formRows(source: string): string {
  const parsed: unknown = JSON.parse(source)
  if (!Array.isArray(parsed)) throw new Error('Body/FormData 须输入 JSON 数组')
  const rows = parsed.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('JSON 数组成员必须是对象')
    const member = Object.fromEntries(Object.entries(item))
    return {fieldName: text(member['fieldName'] ?? member['name'], ''), fieldType: text(member['fieldType'] ?? member['type'], 'string'),
      defaultValue: text(member['defaultValue'] ?? member['value'], ''), valueFun: text(member['valueFun'], '')}
  })
  return rows.length ? JSON.stringify(rows) : ''
}
function confirm(): void {
  try {
    if (view.destroyed || sparkConsume(PAGE_RUNTIME) !== runtime || view.currentRow !== row) throw new Error('当前接口已切换，请关闭后重新导入')
    const access = view.fieldAccess(row, field)
    if (access.read !== 'visible' || access.write !== 'allowed') throw new Error('当前请求体不可编辑')
    const current = view.getEditingRow(rowId)
    if (!current || String(current[field] ?? '') !== original || current['RequestType'] !== (props.target === 'form' ? 'FormData' : 'Body')) {
      throw new Error('请求体或参数类型已变更，请关闭后重新导入')
    }
    const source = input.value
    let next = source
    if (source.trim()) {
      if (props.target === 'form') next = formRows(source)
      else JSON.parse(source)
    }
    if (next !== original) view.updateEditingValue(rowId, field, next)
    emit('close')
  } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
function cancel(): void {
  emit('close')
}
</script>
