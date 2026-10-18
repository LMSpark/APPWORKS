<!--
@module @spark-appworks/spark-component:components/fields/non-data-components/FieldTableCellScope
职责：为表格中的标准字段控件建立独立单元格宿主，并传递原视图与行身份。
边界：内部组件，不注册为业务页面控件，不查询、修改行指针或复制编辑状态。
AI用途：标准字段在表格中呈现输入控件时复用此宿主，继续使用字段本身的绑定和权限逻辑。
-->
<template><slot /></template>
<script setup lang="ts">
import {provide} from 'vue'
import type {DataRow, DataView} from '@spark-appworks/spark-data'
import {useSparkComponent} from '../../internal'
import {TABLE_FIELD_CELL} from '../context/tableCellContext'

const props = defineProps<{
  /** The original DataView resolved by the field's complete binding. */
  source: DataView | undefined
  /** Original table row; no edit overlay is duplicated in this host. */
  row: DataRow
}>()
useSparkComponent({type: 'r-field-cell-control'})
provide(TABLE_FIELD_CELL, {source: () => props.source, row: () => props.row})
</script>
