<!--
@module app:views/app/dev-system/components/NodeStateConfig
职责：编辑正式导航发布、子项显示、分组和排序。
边界：状态写入navigation分组，业务kind不由显示状态推断。
AI用途：调整节点导航展示并经领域dirty与Workspace保存。
-->
<template>
  <div v-if="state.blueprintDraft.navigation">
    <el-divider content-position="left">导航显示</el-divider>
    <el-alert v-if="optionError" type="error" :closable="false" :title="`导航字典读取失败：${optionError}`" />
    <el-form-item v-if="access('IsShowAtNav').read" label="发布到菜单"><el-switch v-model="state.blueprintDraft.navigation.publishInMenu" :disabled="!access('IsShowAtNav').write" @change="state.markBlueprintDirty" /></el-form-item>
    <el-form-item v-if="access('IsShowChildItem').read" label="显示子项"><el-switch v-model="state.blueprintDraft.navigation.showChildren" :disabled="!access('IsShowChildItem').write" @change="state.markBlueprintDirty" /></el-form-item>
    <el-form-item v-if="access('NavigationShowType').read" label="显示方式"><FieldSelect :data-view-key="navigationViewKey" data-member="currentRow" data-field="NavigationShowType" :option-data-view-key="showTypeOptionsKey" option-value-field="val" option-label-field="txt" :readonly="!optionsReady || !access('NavigationShowType').write" @update:model-value="state.notifyExternalDataViewChanged" /></el-form-item>
    <el-form-item v-if="access('HorizontalAlignment').read" label="水平对齐"><FieldSelect :data-view-key="navigationViewKey" data-member="currentRow" data-field="HorizontalAlignment" :option-data-view-key="alignmentOptionsKey" option-value-field="val" option-label-field="txt" :readonly="!optionsReady || !access('HorizontalAlignment').write" @update:model-value="state.notifyExternalDataViewChanged" /></el-form-item>
    <el-form-item v-if="access('BeginGroup').read" label="开始分组"><el-switch v-model="state.blueprintDraft.navigation.beginGroup" :disabled="!access('BeginGroup').write" @change="state.markBlueprintDirty" /></el-form-item>
    <el-form-item v-if="access('FunOrderValue').read" label="排序"><el-input-number v-model="state.blueprintDraft.navigation.order" :disabled="!access('FunOrderValue').write" @change="state.markBlueprintDirty" /></el-form-item>
  </div>
</template>
<script setup lang="ts">
import {onMounted, ref} from 'vue'
import {buildDataViewKey} from '@spark-appworks/spark-data'
import {FieldSelect} from '@spark-appworks/spark-component'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
import type { DevState } from '../useDevState'
const props=defineProps<{ state: DevState }>()
const access=(field:string)=>props.state.blueprintNodeFieldAccess(field)
const navigationViewKey=buildDataViewKey('Base_NavigationInfo','default',LOWCODE_APPLICATION_CATALOG_FORM_KEY)
const showTypeOptionsKey=buildDataViewKey('_Base_DictData','NavigationShowType_Content',LowcodeDictionary.editorScenarioId)
const alignmentOptionsKey=buildDataViewKey('_Base_DictData','Navigationposition',LowcodeDictionary.editorScenarioId)
const optionError=ref('')
const optionsReady=ref(false)
onMounted(async()=>{try{await props.state.loadNavigationDictionaryOptions();optionsReady.value=true}catch(error){optionError.value=error instanceof Error?error.message:String(error)}})
</script>
