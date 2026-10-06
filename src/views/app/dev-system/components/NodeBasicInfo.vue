<!--
@module app:views/app/dev-system/components/NodeBasicInfo
职责：直接编辑正式kind及能力、导航、数据空间、原型四组草稿。
边界：节点身份只读，模型名称是后端只读依赖投影，不保留旧平铺字段。
AI用途：为选中节点配置四组领域信息并标记蓝图dirty。
-->
<template>
  <div>
    <el-divider content-position="left">能力信息</el-divider>
    <el-form-item label="节点 ID"><el-input :model-value="state.blueprintDraft.nodeId" disabled /></el-form-item>
    <el-form-item label="能力名称"><el-input v-model="state.blueprintDraft.capability.name" @change="state.markBlueprintDirty" /></el-form-item>
    <el-form-item label="业务种类"><el-select v-model="state.blueprintDraft.kind" @change="state.markBlueprintDirty"><el-option v-for="option in kindOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item>
    <el-form-item label="功能描述"><el-input v-model="state.blueprintDraft.capability.description" type="textarea" :autosize="{minRows:4,maxRows:12}" @change="state.markBlueprintDirty" /></el-form-item>
    <el-form-item label="提供导航"><el-switch v-model="hasNavigation" /></el-form-item>
    <template v-if="state.blueprintDraft.navigation">
      <el-divider content-position="left">导航信息</el-divider>
      <el-form-item label="菜单标题"><el-input v-model="state.blueprintDraft.navigation.title" @change="state.markBlueprintDirty" /></el-form-item>
      <el-form-item label="图标"><IconPicker :model-value="state.blueprintDraft.navigation.icon ?? ''" @update:model-value="state.blueprintDraft.navigation.icon = $event; state.markBlueprintDirty()" /></el-form-item>
      <el-form-item label="工具或页面目标"><el-input v-model="state.blueprintDraft.navigation.target" @change="state.markBlueprintDirty" /></el-form-item>
    </template>
    <el-form-item label="绑定数据空间"><el-switch v-model="hasDataSpace" /></el-form-item>
    <template v-if="state.blueprintDraft.dataSpace">
      <el-divider content-position="left">数据空间</el-divider>
      <el-form-item label="场景 ID"><el-input v-model="state.blueprintDraft.dataSpace.scenarioId" @change="state.markBlueprintDirty" /></el-form-item>
      <el-form-item label="模型名称"><el-input :model-value="modelNames" readonly placeholder="由正式场景模型定义提供" /></el-form-item>
    </template>
    <el-form-item label="提供原型"><el-switch v-model="hasPrototype" /></el-form-item>
    <el-form-item v-if="state.blueprintDraft.prototype" label="原型描述"><el-input v-model="state.blueprintDraft.prototype.htmlDescription" type="textarea" :rows="6" @change="state.markBlueprintDirty" /></el-form-item>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { PROJECT_BLUEPRINT_NODE_KINDS } from '@spark-appworks/spark-utils'
import type { ProjectBlueprintNodeKind } from '@spark-appworks/spark-utils'
import type { DevState } from '../useDevState'
import IconPicker from '@/components/IconPicker.vue'
const props = defineProps<{state:DevState}>()
const labels:Record<ProjectBlueprintNodeKind,string>={module:'模块',page:'页面',embedded:'嵌入内容',service:'服务',content:'内容'}
const kindOptions=PROJECT_BLUEPRINT_NODE_KINDS.map(value=>({value,label:labels[value]}))
const hasNavigation = computed({get:()=>props.state.blueprintDraft.navigation !== undefined,set:(enabled:boolean)=>{if(enabled)props.state.blueprintDraft.navigation={title:props.state.blueprintDraft.capability.name,order:0,publishInMenu:true,showChildren:true,beginGroup:false};else delete props.state.blueprintDraft.navigation;props.state.markBlueprintDirty()}})
const hasDataSpace = computed({get:()=>props.state.blueprintDraft.dataSpace !== undefined,set:(enabled:boolean)=>{if(enabled)props.state.blueprintDraft.dataSpace={scenarioId:'',models:[]};else delete props.state.blueprintDraft.dataSpace;props.state.markBlueprintDirty()}})
const hasPrototype = computed({get:()=>props.state.blueprintDraft.prototype !== undefined,set:(enabled:boolean)=>{if(enabled)props.state.blueprintDraft.prototype={htmlDescription:''};else delete props.state.blueprintDraft.prototype;props.state.markBlueprintDirty()}})
const modelNames = computed(()=>props.state.blueprintDraft.dataSpace?.models.map(model=>model.metaName).join(', ') ?? '')
</script>
