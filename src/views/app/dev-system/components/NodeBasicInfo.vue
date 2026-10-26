<!--
@module app:views/app/dev-system/components/NodeBasicInfo
职责：直接编辑正式kind及能力、导航、数据空间、原型四组草稿。
边界：节点身份只读，模型名称是后端只读依赖投影，不保留旧平铺字段。
AI用途：为选中节点配置四组领域信息并标记蓝图dirty。
-->
<template>
  <div>
    <template v-if="includes('capability')">
    <el-divider content-position="left">能力信息</el-divider>
    <el-form-item label="节点 ID"><el-input :model-value="state.blueprintDraft.nodeId" disabled /></el-form-item>
    <el-form-item v-if="access('name').read" label="能力名称"><el-input v-model="state.blueprintDraft.capability.name" :disabled="!access('name').write" @change="state.markBlueprintDirty" /></el-form-item>
    <el-form-item v-if="access('conType').read" label="业务种类"><el-select v-model="state.blueprintDraft.kind" :disabled="!access('conType').write" @change="state.markBlueprintDirty"><el-option v-for="option in kindOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item>
    <el-form-item v-if="access('memo').read" label="功能描述"><el-input v-model="state.blueprintDraft.capability.description" :disabled="!access('memo').write" type="textarea" :autosize="{minRows:4,maxRows:12}" @change="state.markBlueprintDirty" /></el-form-item>
    </template>
    <template v-if="includes('navigation')">
    <el-form-item v-if="state.blueprintNodeFieldAccess('FunName').read" label="提供导航"><el-switch v-model="hasNavigation" :disabled="!state.blueprintNodeSectionWritable('navigation')" /></el-form-item>
    <template v-if="state.blueprintDraft.navigation">
      <el-divider content-position="left">导航信息</el-divider>
      <el-form-item v-if="access('FunName').read" label="菜单标题"><el-input v-model="state.blueprintDraft.navigation.title" :disabled="!access('FunName').write" @change="state.markBlueprintDirty" /></el-form-item>
      <el-form-item v-if="access('NavigationImageWxz').read" label="图标"><IconPicker v-if="access('NavigationImageWxz').write" :model-value="state.blueprintDraft.navigation.icon ?? ''" @update:model-value="state.blueprintDraft.navigation.icon = $event; state.markBlueprintDirty()" /><el-input v-else :model-value="state.blueprintDraft.navigation.icon ?? ''" disabled /></el-form-item>
      <el-form-item v-if="includes('navigation-target') && access('NavigationUrl').read" label="工具或页面目标"><el-input v-model="state.blueprintDraft.navigation.target" :disabled="!access('NavigationUrl').write" @change="state.markBlueprintDirty" /></el-form-item>
    </template>
    </template>
    <template v-if="includes('data-space')">
    <el-form-item v-if="access('conid').read" label="绑定数据空间"><el-switch v-model="hasDataSpace" :disabled="!access('conid').write" /></el-form-item>
    <template v-if="state.blueprintDraft.dataSpace">
      <el-divider content-position="left">数据空间</el-divider>
      <el-form-item v-if="access('conid').read" label="场景 ID"><el-input v-model="state.blueprintDraft.dataSpace.scenarioId" :disabled="!access('conid').write" @change="state.markBlueprintDirty" /></el-form-item>
      <el-form-item label="模型名称"><el-input :model-value="modelNames" readonly placeholder="由正式场景模型定义提供" /></el-form-item>
    </template>
    </template>
    <template v-if="includes('prototype')">
    <el-form-item v-if="access('htmlDesc').read" label="提供原型"><el-switch v-model="hasPrototype" :disabled="!access('htmlDesc').write" /></el-form-item>
    <el-form-item v-if="state.blueprintDraft.prototype && access('htmlDesc').read" label="原型描述"><el-input v-model="state.blueprintDraft.prototype.htmlDescription" :disabled="!access('htmlDesc').write" type="textarea" :rows="6" @change="state.markBlueprintDirty" /></el-form-item>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { PROJECT_BLUEPRINT_NODE_KINDS } from '@spark-appworks/spark-utils'
import type { ProjectBlueprintNodeKind } from '@spark-appworks/spark-utils'
import type { DevState } from '../useDevState'
import IconPicker from '@/components/IconPicker.vue'
/** Selects blueprint domains for the shared DataView-backed editor; omitted means every section. */
type Section = 'capability' | 'navigation' | 'navigation-target' | 'data-space' | 'prototype'
const props = defineProps<{state:DevState;sections?:readonly Section[]}>()
const includes = (section: Section) => props.sections === undefined ? true : props.sections.includes(section)
const labels:Record<ProjectBlueprintNodeKind,string>={module:'模块',page:'页面',embedded:'嵌入内容',service:'服务',content:'内容'}
const kindOptions=PROJECT_BLUEPRINT_NODE_KINDS.map(value=>({value,label:labels[value]}))
const access=(field:string)=>props.state.blueprintNodeFieldAccess(field)
const hasNavigation = computed({get:()=>props.state.blueprintDraft.navigation !== undefined,set:(enabled:boolean)=>{if(enabled)props.state.blueprintDraft.navigation={title:props.state.blueprintDraft.capability.name??'',order:0,publishInMenu:true,showChildren:true,beginGroup:false};else delete props.state.blueprintDraft.navigation;props.state.markBlueprintDirty()}})
const hasDataSpace = computed({get:()=>props.state.blueprintDraft.dataSpace !== undefined,set:(enabled:boolean)=>{if(enabled)props.state.blueprintDraft.dataSpace={scenarioId:'',models:[]};else delete props.state.blueprintDraft.dataSpace;props.state.markBlueprintDirty()}})
const hasPrototype = computed({get:()=>props.state.blueprintDraft.prototype !== undefined,set:(enabled:boolean)=>{if(enabled)props.state.blueprintDraft.prototype={htmlDescription:''};else delete props.state.blueprintDraft.prototype;props.state.markBlueprintDirty()}})
const modelNames = computed(()=>props.state.blueprintDraft.dataSpace?.models?.map(model=>model.metaName).join(', ') ?? '')
</script>
