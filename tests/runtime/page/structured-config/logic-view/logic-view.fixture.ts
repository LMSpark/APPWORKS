import type {RequestConfig} from '@spark-appworks/spark-utils'
import {ApiBackend} from '../../api-provider/api-provider.fixture'

/** 正式CRUD仍由ApiBackend确认存储；设计文件单独维护数组和回读，不能用发出请求代替保存成功。 */
export class LogicViewHttp extends ApiBackend {
  posts: Array<{url: string; data: unknown}> = []
  logicDesigns: Record<string, unknown[]> = {}
  missingDesigns = new Set<string>()
  override post<T>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T> {
    this.posts.push({url, data})
    if (url.includes('ViewData/GetView')) {
      if (this.missingDesigns.has(String(config?.params?.['viewId'] ?? ''))) return Promise.resolve({Code: 1003, Message: '数据不存在', Result: null} as T)
      return Promise.resolve({Code: 200, Result: structuredClone(this.logicDesigns[String(config?.params?.['viewId'] ?? '')] ?? [])} as T)
    }
    if (url.includes('ViewData/SaveView')) {
      const payload = data as {viewId: string; data: unknown[]}
      this.logicDesigns[payload.viewId] = structuredClone(payload.data)
      return Promise.resolve({Code: 200, Result: '保存成功'} as T)
    }
    return super.post<T>(url, data, config)
  }
}
