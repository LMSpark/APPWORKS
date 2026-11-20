<!--
@module @spark-appworks/spark-component:components/fields/data-components/picker/FieldUserPicker/FieldUserPicker
职责：实现 FieldUserPicker（r-user-picker）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field user picker 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<script lang="ts">
/**
 * @description 用户选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择用户。
 */
import { createPickerPreset } from '../../../createPickerPreset'

export default createPickerPreset({
  entityName: '人员',
  placeholder: '请选择人员',
  buttonText: '选人',
  readonlyButtonText: '查看人员',
})
</script>