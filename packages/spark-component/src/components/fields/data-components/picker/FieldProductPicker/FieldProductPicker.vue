<!--
@module @spark-appworks/spark-component:components/fields/data-components/picker/FieldProductPicker/FieldProductPicker
职责：实现 FieldProductPicker（r-product-picker）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field product picker 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<script lang="ts">
/**
 * @description 产品选择器字段，基于实体选择器预设工厂（createPickerPreset），弹窗选择产品。
 */
import { createPickerPreset } from '../../../createPickerPreset'

export default createPickerPreset({
  entityName: '商品',
  placeholder: '请选择商品',
  buttonText: '选商品',
  readonlyButtonText: '查看商品',
})
</script>