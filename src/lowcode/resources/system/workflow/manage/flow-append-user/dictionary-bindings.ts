/**
 * @module app:lowcode/resources/system/workflow/manage/flow-append-user/dictionary-bindings
 * 职责：把参考页两类应用字典声明接到既有只读DataView适配。
 * 边界：步骤与办理字典各有来源，不用实例状态替代，不维护页面标签数组。
 */
import {ApplicationDictionaryResource, type ApplicationDictionaryResourceOptions} from '@spark-appworks/spark-lowcode-api'
import type {LowcodeDataSpaceAssemblerInput} from '@/lowcode/data-space/lowcode-data-space-assembler'

export function createFlowAppendDictionaryBindings(input: Omit<ApplicationDictionaryResourceOptions, 'name'>): NonNullable<LowcodeDataSpaceAssemblerInput['projectionBindings']> {
  return {
    AppendStepStates: view => new ApplicationDictionaryResource({...input, name: '流程步骤状态'}).binding(view),
    AppendHandleStates: view => new ApplicationDictionaryResource({...input, name: '流程办理状态'}).binding(view),
  }
}
