/**
 * @module app:services/project/enterprise-landing
 * 职责：按本企业 ent_config.defaultApplicationId 解析登录落点，并为应用目录提供设为/取消默认应用。
 * 边界：企业配置经入驻场景 tenantEnterprise 视图的 JSON 成员读写，只提交本企业行的 ent_config；
 *   默认应用须在当前可见应用目录中才进入；未设置、不可见或读取失败均提示后进入应用列表，不静默。
 */
import type {Router} from 'vue-router'
import {ElMessage} from 'element-plus'
import {getNavHomePath} from '@spark-appworks/spark-app'
import type {DataRow, DataSet, DataView} from '@spark-appworks/spark-data'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import {getFormalModelView, loadLowcodeEnterpriseCatalog, readLowcodeApplications} from '@/lowcode/lowcode-application-catalog'
import {APPLICATION_CATALOG_PROJECT_ID, buildApplicationPath} from '@/services/application-scope'
import type {ProjectSwitchService} from './project-shell'

const DEFAULT_APPLICATION = {field: 'ent_config', path: ['defaultApplicationId']} as const

/** 本企业默认应用配置；持有目录作用域 DataSet，使用后须 destroy。 */
export class EnterpriseDefaultApplication {
  private constructor(private readonly dataSet: DataSet, private readonly view: DataView, private readonly recordId: string) {}

  static async load(assertCurrent: () => void): Promise<EnterpriseDefaultApplication> {
    const shortName = lowcodeApi.session.get()?.enterprise.shortName.trim()
    if (!shortName) throw new Error('当前会话缺少企业英文简称')
    const dataSet = await loadLowcodeEnterpriseCatalog(assertCurrent)
    try {
      const view = getFormalModelView(dataSet, 'Base_Enterprise_Info', 'tenantEnterprise')
      view.queryContext = {...view.queryContext, entShortName: shortName}
      const result = await view.requestRefresh()
      assertCurrent()
      if (!result.success) throw new Error(result.message ?? '企业配置查询失败')
      const row = view.rows.length === 1 ? view.rows[0] : undefined
      const id = row ? view.getPkKey(row) : undefined
      if (id === undefined || id === '') throw new Error('未读取到唯一的本企业配置记录')
      return new EnterpriseDefaultApplication(dataSet, view, String(id))
    } catch (error) {
      dataSet.destroy()
      throw error
    }
  }

  private get row(): DataRow {
    const row = this.view.rows.find(item => String(this.view.getPkKey(item)) === this.recordId)
    if (!row) throw new Error('本企业配置记录已不在当前结果中')
    return row
  }

  /** 已保存的默认应用 ID；未设置时为空串。 */
  get applicationId(): string {
    const row = this.row
    if (this.view.fieldAccess(row, 'ent_config').read !== 'visible') throw new Error('无权读取企业配置')
    const value = this.view.readFieldMember(row, DEFAULT_APPLICATION)
    if (value === undefined || value === null || value === '') return ''
    if (typeof value !== 'string') throw new Error('企业默认应用配置格式无效')
    return value.trim()
  }

  get writable(): boolean {
    return this.view.fieldAccess(this.row, 'ent_config').write === 'allowed'
  }

  /** 设置或清除默认应用：只提交本行 ent_config，保存后回读核对；失败且非未知结果时撤销本地编辑。 */
  async save(applicationId: string | null): Promise<void> {
    if (!this.writable) throw new Error('无权修改企业配置')
    if (this.view.hasEditingChanges() || this.view.hasUnconfirmedSave) throw new Error('上一次企业配置尚未保存或确认')
    this.view.updateEditingMember(this.recordId, {...DEFAULT_APPLICATION, value: applicationId ?? undefined})
    try {
      await this.dataSet.saveChanges({views: [{tableName: this.view.tableName, viewId: this.view.viewId, ids: [this.recordId]}]})
    } catch (error) {
      if (!this.view.hasUnconfirmedSaveFor([this.recordId])) this.view.discardPendingChanges([this.recordId])
      throw error
    }
    const result = await this.view.requestRefresh()
    if (!result.success) throw new Error('默认应用已提交，但回读失败，请刷新核对')
    if (this.applicationId !== (applicationId ?? '')) throw new Error('默认应用回读结果与提交不一致，请刷新核对')
  }

  destroy(): void {
    this.dataSet.destroy()
  }
}

type EnterpriseLanding = Readonly<{applicationId: string} | {level: 'info' | 'warning'; message: string}>

async function resolveEnterpriseLanding(assertCurrent: () => void): Promise<EnterpriseLanding> {
  let config: EnterpriseDefaultApplication
  try {
    config = await EnterpriseDefaultApplication.load(assertCurrent)
  } catch (error) {
    return {level: 'warning', message: `企业默认应用读取失败：${error instanceof Error ? error.message : String(error)}，已进入应用列表`}
  }
  try {
    const applicationId = config.applicationId
    if (!applicationId) return {level: 'info', message: '企业未设置默认应用，已进入应用列表'}
    const applications = await readLowcodeApplications(assertCurrent)
    if (!applications.some(application => application.id === applicationId)) {
      return {level: 'warning', message: '企业默认应用不在当前可见应用中，已进入应用列表'}
    }
    return {applicationId}
  } catch (error) {
    return {level: 'warning', message: `企业默认应用读取失败：${error instanceof Error ? error.message : String(error)}，已进入应用列表`}
  } finally {
    config.destroy()
  }
}

/** 登录后的统一落点：进入企业默认应用首页，否则提示原因并进入应用列表。 */
export async function enterEnterpriseLanding(input: Readonly<{router: Pick<Router, 'replace'>; projectSwitch?: ProjectSwitchService | null}>): Promise<void> {
  const landing = await resolveEnterpriseLanding(() => undefined)
  if ('applicationId' in landing) {
    try {
      if (!input.projectSwitch) throw new Error('缺少应用切换服务')
      const receipt = await input.projectSwitch.switchAndReload(landing.applicationId)
      receipt.assertCurrent()
      const failure = await input.router.replace(buildApplicationPath({projectId: landing.applicationId}, getNavHomePath()))
      receipt.assertCurrent()
      if (!failure) return
      ElMessage.warning('企业默认应用导航未完成，已进入应用列表')
    } catch (error) {
      ElMessage.warning(`企业默认应用进入失败：${error instanceof Error ? error.message : String(error)}，已进入应用列表`)
    }
  } else if (landing.level === 'info') {
    ElMessage.info(landing.message)
  } else {
    ElMessage.warning(landing.message)
  }
  await input.router.replace(buildApplicationPath({projectId: APPLICATION_CATALOG_PROJECT_ID}, '/app-list'))
}
