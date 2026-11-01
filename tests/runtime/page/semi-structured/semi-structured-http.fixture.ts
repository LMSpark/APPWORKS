import {StructuredCatalogHttp} from '../structured-config/catalog/structured-config-catalog.fixture'

export class SemiStructuredHttp extends StructuredCatalogHttp {
  override post<T>(url: string, data?: unknown): Promise<T> {
    if (url.includes('GetJson')) return this.trackAndReturn(url, data, {Code: 200, Result: [{id: 'root', name: 'root', pid: null, haschild: false, type: 'boolean', value: false}]} as T)
    if (url.includes('SaveJsonData')) return this.trackAndReturn(url, data, {} as T)
    return super.post(url, data)
  }
  private trackAndReturn<T>(url: string, data: unknown, value: T): Promise<T> {
    this.posts.push({url, data})
    return Promise.resolve(value)
  }
}
