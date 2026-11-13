<!--
@module app:views/platform/login/user-registration-drawer
职责：右侧抽屉内以标准组件编辑注册账号命令行；保存、取消与结果未知时的登录核验复用公共单记录生命周期。
边界：不创建数据实例、不直接调用认证接口；结果未知时不能关闭或重提；明确失败后通知宿主改开新命令行，回执由宿主读取。
-->
<template>
  <RendererDrawer :model-value="true" :data-view-key="dataViewKey" title="注册账号" :grid-columns="1" :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <RendererForm :data-view-key="dataViewKey" data-member="currentRow" :context-row-id="recordId" :grid-columns="1" :auto-columns="false"
      :show-data-view-meta="false" :form-props="{labelPosition: 'top'}">
      <FieldText field="enterpriseName" label="企业英文简称" placeholder="企业英文简称" prefix-icon="OfficeBuilding" :readonly="locked" />
      <FieldText field="account" label="登录账号" placeholder="登录账号" prefix-icon="User" :readonly="locked" />
      <FieldText field="displayName" label="显示名称" placeholder="显示名称" prefix-icon="Edit" :readonly="locked" />
      <FieldSelect field="sex" label="性别" :options="sexOptions" :clearable="false" :readonly="locked" />
      <FieldSelect field="channel" label="验证方式" :options="channelOptions" :clearable="false" :readonly="locked" />
      <FieldText field="contact" label="验证账号" :placeholder="mobile ? '验证手机号' : '验证邮箱'" prefix-icon="Message" :readonly="locked" />
      <FieldText field="password" label="密码" placeholder="至少 6 位" prefix-icon="Lock" :show-password="true" :readonly="locked" />
      <FieldText field="confirmPassword" label="确认密码" placeholder="再次输入密码" prefix-icon="Lock" :show-password="true" :readonly="locked" />
      <FieldText field="verificationCode" label="验证码" placeholder="验证码" :readonly="locked" />
    </RendererForm>
    <VerificationCodeButton :data-view-key="codeDataViewKey" :disabled="locked" :request="{enterpriseName: value('enterpriseName'),
      channel: value('channel'), account: value('contact'), scene: 'REGISTER'}" />
    <p v-if="error || shownRejection" class="registration-drawer__error" role="alert">{{ error || shownRejection }}</p>
    <p v-if="ownUnconfirmed" role="status">注册结果尚未确认；核验会用同一账号和密码尝试登录，不会重复注册。</p>
    <template #footer>
      <RendererButton label="取消" :disabled="busy || ownUnconfirmed" @click="cancel" />
      <RendererButton :label="ownUnconfirmed ? '核验注册结果' : '注册'" button-type="primary"
        :disabled="busy || foreignRecovery || recoveryEnded" @click="submit" />
    </template>
  </RendererDrawer>
</template>
<script setup lang="ts">
import {computed, ref} from 'vue'
import * as Components from '@spark-appworks/spark-component'
import type {DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
import VerificationCodeButton from './verification-code-button.vue'
const {PAGE_RUNTIME, FieldSelect, FieldText, RendererButton, RendererDrawer, RendererForm, useDataViewRecordEditing, useSparkComponent} = Components

/** dataViewKey/recordId 为注册账号命令行；codeDataViewKey 为发送验证码命令视图；rejection 为上一命令行的明确失败。 */
const props = defineProps<{dataViewKey: string; recordId: string | number; codeDataViewKey: string; rejection?: string}>()
const emit = defineEmits<{finish: [result: DataViewRecordEditingFinish]; rejected: [reason: string]}>()
const shownRejection = ref(props.rejection ?? '')
const sexOptions = [{label: '女', value: 'F'}, {label: '男', value: 'M'}]
const channelOptions = [{label: '邮箱', value: 'EMAIL'}, {label: '手机号', value: 'MOBILE'}]
const {sparkConsume} = useSparkComponent({type: 'user-registration-drawer'})
const {busy, current, error, locked, ownUnconfirmed, foreignRecovery, recoveryEnded, row, save, cancel} = useDataViewRecordEditing({mode: 'edit', created: () => true,
  editableFields: ['enterpriseName', 'account', 'displayName', 'sex', 'channel', 'contact', 'verificationCode', 'password', 'confirmPassword'],
  runtime: () => sparkConsume(PAGE_RUNTIME), dataViewKey: () => props.dataViewKey, recordId: () => props.recordId, onFinish: result => emit('finish', result)})
const mobile = computed(() => value('channel') === 'MOBILE')
function value(field: string): string {
  const raw = row.value?.[field]
  return typeof raw === 'string' ? raw : ''
}
async function submit(): Promise<void> {
  shownRejection.value = ''
  await save()
  if (error.value && !ownUnconfirmed.value && !current.value) emit('rejected', error.value)
}
</script>
<style scoped>
.registration-drawer__error {
  color: var(--el-color-danger);
  font-size: 13px;
}
</style>
