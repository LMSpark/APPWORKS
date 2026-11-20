<!--
@module @spark-appworks/spark-component:components/fields/data-components/picker/FieldDeptPicker/FieldDeptPicker
职责：实现 FieldDeptPicker（r-dept-picker）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field dept picker 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<script lang="ts">
/**
 * @description 部门选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择部门。
 */
import { createPickerPreset } from '../../../createPickerPreset'

export default createPickerPreset({
  entityName: '部门',
  placeholder: '请选择部门',
  buttonText: '选部门',
  readonlyButtonText: '查看部门',
})
</script>