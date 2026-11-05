<!--
@module @spark-appworks/spark-component:components/fields/non-data-components/FieldTableCellScope
职责：为表格中的标准字段控件建立独立单元格宿主，并传递原视图与行身份。
边界：内部组件，不注册为业务页面控件，不查询、修改行指针或复制编辑状态。
AI用途：标准字段在表格中呈现输入控件时复用此宿主，继续使用字段本身的绑定和权限逻辑。
-->
<template><slot /></template>
<script setup lang="ts">
import {provide, toRaw} from 'vue'
import type {DataRow, DataView} from '@spark-appworks/spark-data'
import {useSparkComponent} from '../../internal'
import {TABLE_FIELD_CELL} from '../context/tableCellContext'
import {FIELD_ROW_CONTEXT} from '../context/fieldRowContext'

const props = defineProps<{
  /** The original DataView resolved by the field's complete binding. */
  source: DataView | undefined
  /** Original table row; no edit overlay is duplicated in this host. */
  row: DataRow
  /** 创建宿主时选择标准只读详情呈现，避免在只读树表中生成禁用输入框；默认保留原单元格控件。切换此模式须重建宿主。 */
  displayOnly?: boolean
}>()
useSparkComponent({type: props.displayOnly === true ? 'r-field-cell-detail' : 'r-field-cell-control'})
provide(TABLE_FIELD_CELL, true)
provide(FIELD_ROW_CONTEXT, {row: source => source && toRaw(source) === toRaw(props.source)
  ? source.rows.find(row => toRaw(row) === toRaw(props.row)) ?? null : null})
</script>
