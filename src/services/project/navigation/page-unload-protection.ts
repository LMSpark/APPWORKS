/**
 * @module app:services/project/navigation/page-unload-protection
 * 职责：浏览器离页前复用当前路由管理器的运行实例检查。
 */
import {getDynamicRouter} from '@spark-appworks/spark-app'

export function protectPageChanges(event: BeforeUnloadEvent): void {
  try {
    getDynamicRouter()?.assertPageRuntimesClean()
  } catch {
    event.preventDefault()
    event.returnValue = ''
  }
}
