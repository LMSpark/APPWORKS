/**
 * @module app:lowcode/resources/data-space/design/read-formal-models
 * 职责：读取数据空间设计态正式模型目录，供维度来源编辑等数据层消费者装配。
 * 边界：只读设计元数据；调用方须自备 assertCurrent 与场景/dataSpace 身份。
 */
import type {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'

export const readDataSpaceDesignModels: DataSpaceDesignApi['readModels'] = request =>
  lowcodeApi.dataSpace.design.readModels(request)