/**
 * @module app:services/project/navigation/project-management-target
 * 职责：项目管理系统页的唯一导航身份及蓝图来源节点路由。
 * 边界：仅构造路由；应用选择、未保存保护及节点归属由现有路由守卫和目标宿主处理。
 */
import {SYSTEM_PAGE_NAVIGATION_ID_QUERY} from '@spark-appworks/spark-app'
import {buildApplicationPath} from '@/services/application-scope'

export const PROJECT_MANAGEMENT_PATH = '/features/application/application-function-management/ui/application-function-page'
export const PROJECT_MANAGEMENT_NODE_ID = '7AB874097A1E8711A42FD845939A6E05'

/** 定位指定应用的原蓝图节点，不回退默认应用或首节点。 */
export function buildBlueprintNodeTarget(projectId: string, nodeId: string) {
  if (!projectId.trim() || projectId !== projectId.trim() || /[/?#\\%\u0000-\u001f]/u.test(projectId)
    || !nodeId.trim() || nodeId !== nodeId.trim()) {
    throw new Error('来源应用或节点身份缺失或无效')
  }
  return {path: buildApplicationPath({projectId}, PROJECT_MANAGEMENT_PATH), query: {
    [SYSTEM_PAGE_NAVIGATION_ID_QUERY]: PROJECT_MANAGEMENT_NODE_ID, nodeId, blueprintTab: 'dataSpace',
  }}
}
