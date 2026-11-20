<!--
@module app:views/platform/login/login-form
职责：标准组件编辑登录命令行；回车或“登录”经公共单记录生命周期保存该行。
边界：不创建数据实例、不直接调用认证接口；明确失败后原编辑身份失效，通知宿主改开新命令行，保存成功后由宿主读取回执。
-->
<template>
  <RendererForm :data-view-key="dataViewKey" data-member="currentRow" :context-row-id="recordId" :grid-columns="1" :auto-columns="false"
    :show-data-view-meta="false" :form-props="{labelPosition: 'top'}" @submit="submit">
    <FieldSelect v-if="catalogKey" field="enterpriseName" label="企业" placeholder="选择或输入企业英文简称" :option-data-view-key="catalogKey"
      option-value-field="shortName" option-label-field="name" :filterable="true" :allow-create="true" :readonly="locked" />
    <FieldText v-else field="enterpriseName" label="企业" placeholder="企业英文简称" prefix-icon="OfficeBuilding" :readonly="locked" />
    <FieldText field="account" label="登录账号" placeholder="登录账号" prefix-icon="User" :readonly="locked" />
    <FieldText field="password" label="密码" placeholder="密码" prefix-icon="Lock" :show-password="true" :readonly="locked" />
  </RendererForm>
  <p v-if="error || shownRejection" class="login-form__error" role="alert">{{ error || shownRejection }}</p>
  <div class="login-form__actions">
    <RendererButton class="login-form__submit" label="登 录" button-type="primary" :disabled="busy || disabled" @click="submit" />
    <RendererButton label="取 消" :disabled="busy" @click="emit('leave')" />
  </div>
</template>
<script setup lang="ts">
import {ref} from 'vue'
import {PAGE_RUNTIME, FieldSelect, FieldText, RendererButton, RendererForm, useDataViewRecordEditing, useSparkComponent, type DataViewRecordEditingFinish} from '@spark-appworks/spark-component'

/** catalogKey 为企业目录选项视图；目录不可用时省略，改为直接输入英文简称。disabled 表示宿主正在进入企业落点；rejection 为上一命令行的明确失败。 */
const props = defineProps<{dataViewKey: string; recordId: string | number; catalogKey?: string; disabled?: boolean; rejection?: string}>()
const emit = defineEmits<{finish: [result: DataViewRecordEditingFinish]; rejected: [reason: string]; leave: []}>()
const {sparkConsume} = useSparkComponent({type: 'platform-login-form'})
const shownRejection = ref(props.rejection ?? '')
const {busy, current, error, locked, ownUnconfirmed, save} = useDataViewRecordEditing({mode: 'edit', created: () => true,
  editableFields: ['enterpriseName', 'account', 'password'], runtime: () => sparkConsume(PAGE_RUNTIME), dataViewKey: () => props.dataViewKey,
  recordId: () => props.recordId, onFinish: result => emit('finish', result)})

async function submit(): Promise<void> {
  shownRejection.value = ''
  await save()
  if (error.value && !ownUnconfirmed.value && !current.value) emit('rejected', error.value)
}
</script>
<style scoped>
.login-form__error {
  margin: 8px 0 0;
  padding: 8px 12px;
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-8);
  border-radius: 4px;
  color: var(--el-color-danger);
  font-size: 13px;
}

.login-form__actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.login-form__submit {
  flex: 1;
}
</style>
