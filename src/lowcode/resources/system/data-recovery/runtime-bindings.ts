/**
 * @module app:lowcode/resources/system/data-recovery/runtime-bindings
 * 职责：为正式数据恢复场景的首次装配选择软删除数据的来源分页适配。
 * 边界：只核对本次配置的正式模型身份，不创建表、查询、草稿或页面owner。
 */
import {DataRecoveryPageReadAdapter} from '@spark-appworks/spark-lowcode-api'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from '../../../data-space/lowcode-data-space-assembler'

const scenarioId='70D5D8FACCC201A822F64B16A441BE8F'
const deleted={modelId:'4e488cbc-9673-4b29-b856-84aad912d774',modelName:'获取软删除的数据'} as const
type Input=Readonly<{config:ScenarioViewConfig;assertCurrent:()=>void}>
/** 首次绑定前选择本次来源适配；其他场景不受影响。 */
export function createDataRecoveryScenarioBindings(input:Input):Pick<LowcodeDataSpaceAssemblerInput,'modelAdapters'>{
 if(input.config.scenarioId!==scenarioId)return{}
 input.assertCurrent()
 const tables=input.config.toJSON()['tables'],table=isRecord(tables)?tables[deleted.modelName]:undefined
 const binding=isRecord(table)?table['modelBinding']:undefined
 if(!isRecord(binding)||binding['modelId']!==deleted.modelId||binding['modelName']!==deleted.modelName)throw Error('DATA_RECOVERY_SCENARIO_BINDING: 软删除数据正式身份不符')
 return{modelAdapters:{[deleted.modelId]:new DataRecoveryPageReadAdapter({scenarioId,...deleted})}}
}
