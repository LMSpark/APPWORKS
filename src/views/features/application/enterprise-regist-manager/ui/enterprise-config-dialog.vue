<!--
@module app:views/features/application/enterprise-regist-manager/ui/enterprise-config-dialog
职责：维护企业登录策略与 ent_config 中的注册审核、密码规则、默认密码、验证码位数、默认应用及 Login Token。
边界：各项经标准字段的 valuePath 写回本企业配置行的 ent_config 成员，保留未编辑成员；由公共记录编辑保存，不整串覆盖。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" :title="title" :width="680" :append-to-body="true"
    :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <p v-if="error || hint" role="alert">{{ error || hint }}</p>
    <p v-if="!current" role="status">原企业配置已变化，请关闭并保留原修改。</p>
    <RendererForm :data-view-key="dataViewKey" :context-row-id="recordId" :auto-columns="false" :show-data-view-meta="false" label-width="140px">
      <FieldSelect field="loginPolicy" label="登录策略" placeholder="请选择登录策略" :option-data-view-key="policyKey" :clearable="true" :readonly="locked" />
      <FieldSwitch field="ent_config" :value-path="['user_audit']" label="用户注册审核" active-text="需要审核" inactive-text="无需审核" :readonly="locked" />
      <FieldSelect field="ent_config" :value-path="['defaultApplicationId']" label="默认应用" placeholder="未设置时登录后进入应用列表"
        :option-data-view-key="applicationKey" :filterable="true" :clearable="true" :readonly="locked" />
      <RendererDivider content="密码规则" content-position="left" />
      <FieldNumber field="ent_config" :value-path="['pwd_min_length']" label="密码最小长度" :min="4" :max="32" :placeholder="String(defaults.pwd_min_length)" :readonly="locked" />
      <FieldNumber field="ent_config" :value-path="['pwd_max_length']" label="密码最大长度" :min="6" :max="64" :placeholder="String(defaults.pwd_max_length)" :readonly="locked" />
      <FieldSwitch field="ent_config" :value-path="['pwd_require_letter']" label="必须包含字母" :readonly="locked" />
      <FieldSwitch field="ent_config" :value-path="['pwd_require_digit']" label="必须包含数字" :readonly="locked" />
      <FieldSwitch field="ent_config" :value-path="['pwd_require_special']" label="必须包含特殊字符" :readonly="locked" />
      <FieldText v-if="member('pwd_require_special') !== false" field="ent_config" :value-path="['pwd_special_chars']" label="允许的特殊字符"
        :placeholder="defaults.pwd_special_chars" :readonly="locked" />
      <RendererDivider content="默认密码" content-position="left" />
      <FieldText field="ent_config" :value-path="['mini_program_default_pwd']" label="小程序注册默认密码" placeholder="留空则由系统自动生成强密码"
        :show-password="true" :readonly="locked" />
      <RendererDivider content="验证码" content-position="left" />
      <FieldNumber field="ent_config" :value-path="['verification_code_length']" label="验证码位数" :min="4" :max="8"
        :placeholder="String(defaults.verification_code_length)" :readonly="locked" />
      <RendererDivider content="统一登录 UI" content-position="left" />
      <FieldJson v-if="hasLoginToken" field="ent_config" :value-path="['loginToken']" label="Login Token" mode="text" :height="280" :readonly="locked" />
    </RendererForm>
    <p class="enterprise-config__hint">Login Token 由主应用登录前按租户读取；只能控制完整认证组件的结构、显隐和视觉。</p>
    <RendererButton v-if="!hasLoginToken" label="添加 Login Token" :disabled="locked || busy" @click="addLoginToken" />
    <template #footer>
      <RendererButton :label="foreignRecovery || recoveryEnded || hasStaged ? '关闭并保留修改' : '取消'" :disabled="busy || ownUnconfirmed" @click="cancel" />
      <RendererButton :label="ownUnconfirmed ? '核验原保存结果' : '保存配置'" button-type="primary"
        :disabled="busy || foreignRecovery || recoveryEnded || !current && !ownUnconfirmed" @click="submit" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {ElMessage} from 'element-plus'
import * as Components from '@spark-appworks/spark-component'
import type {DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
const {PAGE_RUNTIME, RendererDialog, RendererForm, RendererButton, RendererDivider, FieldText, FieldNumber, FieldSwitch, FieldSelect, FieldJson,
  useSparkComponent, useDataViewRecordEditing} = Components
const props = defineProps<{dataViewKey: string; policyKey: string; applicationKey: string; recordId: string; title: string}>()
const emit = defineEmits<{close: [result: DataViewRecordEditingFinish]}>()
const {sparkConsume} = useSparkComponent({type: 'enterprise-config-dialog'})
const {view, row, busy, current, locked, error, ownUnconfirmed, foreignRecovery, recoveryEnded, hasStaged, save, cancel} = useDataViewRecordEditing({
  mode: 'edit', runtime: () => sparkConsume(PAGE_RUNTIME), dataViewKey: () => props.dataViewKey, recordId: () => props.recordId,
  editableFields: ['loginPolicy', 'ent_config'], onFinish: result => {
    if (result === 'saved') ElMessage.success('配置保存成功')
    emit('close', result)
  },
})
/** 后端 EntConfig 缺省值；只作输入提示，不写入未编辑成员。 */
const defaults = {pwd_min_length: 8, pwd_max_length: 32, pwd_special_chars: '!@#$%^&*()_+-=[]{}:;,.?', verification_code_length: 4} as const
const hint = ref('')
const hasLoginToken = computed(() => member('loginToken') !== undefined)

function member(name: string): unknown {
  const source = row.value
  if (!source) return undefined
  try {
    return view.readFieldMember(source, {field: 'ent_config', path: [name]})
  } catch {
    return undefined
  }
}
function addLoginToken(): void {
  hint.value = ''
  try {
    view.updateEditingMember(props.recordId, {field: 'ent_config', path: ['loginToken'], value: {}})
  } catch (cause) {
    hint.value = cause instanceof Error ? cause.message : String(cause)
  }
}
async function submit(): Promise<void> {
  hint.value = ''
  if (!ownUnconfirmed.value && row.value) {
    const policy = row.value['loginPolicy']
    if (typeof policy !== 'string' || !policy.trim()) { hint.value = '请选择登录策略'; return }
    const min = member('pwd_min_length') ?? defaults.pwd_min_length, max = member('pwd_max_length') ?? defaults.pwd_max_length
    if (typeof min === 'number' && typeof max === 'number' && max <= min) { hint.value = '密码最大长度必须大于最小长度'; return }
  }
  await save()
}
</script>

<style scoped>
.enterprise-config__hint {margin: 0; color: var(--el-text-color-secondary); font-size: 12px}
</style>
