/**
 * @module app:views/features/application/enterprise-app-auth-application/model/enterprise-app-auth-application-model
 * 职责：企业应用授权三页共用的正式场景身份、会话参数、申请时间呈现及单条记录提交。
 * 边界：只读取当前会话的企业简称与用户ID作为查询参数和操作人，不判断身份放行；提交只经所属DataSet按记录ID保存。
 */
import type {PageServiceCapability} from '@spark-appworks/spark-component'
import type {DataView} from '@spark-appworks/spark-data'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'

export const APP_AUTH_SCENARIOS = {
  myRequests: '47DA54EA853C8780976D43CF2369B096',
  apply: '02215DFBCA2079FBC076CEF7D91FBF6E',
  review: 'C06D41607B6258106F35A0A319B71804',
} as const

/** 本企业英文简称（范围查询参数）与当前用户ID（operator）；缺失即失败，不用空值查询。 */
export function readAppAuthSession(): Readonly<{entShortName: string; userId: string}> {
  const session = lowcodeApi.session.get()
  const entShortName = session?.enterprise.shortName.trim() ?? '', userId = session?.identity.userId.trim() ?? ''
  if (!entShortName || !userId) throw new Error('当前会话缺少企业英文简称或用户身份')
  return {entShortName, userId}
}

/** 申请时间按 yyyy-MM-dd HH:mm:ss 截取前19位，空值显示“-”。 */
export function formatRequestedAt(value: unknown): string {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
  return text ? text.slice(0, 19) : '-'
}

export async function confirmAppAuth(
  message: string,
  title: string,
  ui: Pick<PageServiceCapability, 'showConfirm'>,
): Promise<boolean> {
  return ui.showConfirm(message, title, {type: 'warning'})
}

/**
 * 只提交本条记录的新增或修改。明确失败撤销本地编辑并抛出；结果未知保留待核对状态，提示刷新而不重复写入。
 */
export async function commitAppAuthRecord(view: DataView, id: string | number): Promise<void> {
  if (!view.dataSet) throw new Error('授权视图未接入数据空间')
  try {
    await view.dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
  } catch (cause) {
    const unknown = view.hasUnconfirmedSaveFor([id])
    if (!unknown) view.discardPendingChanges([id])
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new Error(unknown ? `保存结果未知，请刷新核对，不要重复操作：${reason}` : `保存失败：${reason}`)
  }
}
