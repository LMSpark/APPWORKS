<!--
@module app:views/app/dev-system/components/NodeTargetConfig
职责：编辑导航目标和打开方式，按明确cfg目标创建工具。
边界：正式kind与交付表面分离；工具创建走Workspace真实三文件能力。
AI用途：选择原生页面、配置工具或外部链接并检查嵌入能力。
-->
<template>
  <div v-if="state.blueprintDraft.navigation">
    <el-divider content-position="left">导航目标</el-divider>
    <el-form-item label="目标">
      <el-select v-model="target" filterable allow-create clearable placeholder="cfg:工具ID、vue路径或外部地址">
        <el-option v-for="option in targetOptions" :key="option.value" :value="option.value" :label="option.label" />
      </el-select>
    </el-form-item>
    <el-form-item label="移动端目标"><el-input v-model="state.blueprintDraft.navigation.mobileTarget" @change="state.markBlueprintDirty" /></el-form-item>
    <el-form-item label="打开方式"><el-select v-model="state.blueprintDraft.navigation.openMode" @change="state.markBlueprintDirty"><el-option v-for="option in openModes" :key="option.value" :value="option.value" :label="option.label" /></el-select></el-form-item>
    <el-form-item v-if="flags.isPage.value || flags.isContent.value" label="创建工具"><el-button :disabled="!toolId" :loading="creating" @click="createTool">创建并绑定当前工具</el-button></el-form-item>
    <el-form-item v-if="flags.isEmbedded.value" label="嵌入检测"><el-button :loading="state.linkProbeLoading.value" @click="state.probeLinkTarget">检测嵌入</el-button><span v-if="state.linkProbeInfo.value">{{ state.linkProbeInfo.value.reason }}</span></el-form-item>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DevState } from '../useDevState'
import { useNodeKindFlags } from '../composables/useNodeKindFlags'
import { getVuePageOptions } from '@/registries/vue-page-registry'
const props = defineProps<{state:DevState}>()
const flags = useNodeKindFlags(props.state)
const creating = ref(false)
const target = computed({get:()=>props.state.blueprintDraft.navigation?.target ?? '',set:(value:string)=>{const navigation=props.state.blueprintDraft.navigation;if(!navigation)throw new Error('节点缺少导航信息');navigation.target=value;props.state.handlePathChange(value)}})
const toolId = computed(()=>target.value.startsWith('cfg:') ? target.value.slice(4).trim() : '')
const targetOptions = computed(()=>[...getVuePageOptions().map(page=>({value:page.path,label:`页面 · ${page.title}`})),...props.state.pageList.value.filter(page=>page.designSurface==='config-files').map(page=>({value:`cfg:${page.pageId}`,label:`工具 · ${page.title}`}))])
const openModes = [{value:'subsystem',label:'子系统'},{value:'current',label:'当前窗口'},{value:'new-window',label:'新窗口'},{value:'modal',label:'对话框'},{value:'embedded',label:'嵌入'}]
async function createTool():Promise<void> {
  if(!toolId.value)return
  creating.value=true
  try { await props.state.createPageForSelectedNode({pageId:toolId.value,title:props.state.blueprintDraft.navigation?.title ?? props.state.blueprintDraft.capability.name,icon:props.state.blueprintDraft.navigation?.icon ?? 'Document'}) }
  catch(error){props.state.addStatus(`工具创建失败: ${String(error)}`,'error')}
  finally{creating.value=false}
}
</script>
