/**
 * @module @/platform-adapters/api:platform/data-space/design/data-space-model-not-found-error
 * 职责：区分正式精确查询确认零行与权限、网络、重复及损坏合同错误。
 */
import {LowcodeApiError} from '../../../core/lowcode-api-error.js'

/** 仅由正式模型精确查询在rows与total均为零时产生；不表示其他来源获得业务写权限。 */
export class DataSpaceModelNotFoundError extends LowcodeApiError {
  constructor(public readonly dataSpaceId: string, public readonly metaName: string) {
    super(0, `正式数据空间模型不存在: ${dataSpaceId}@${metaName}`)
  }
}
