import {StructuredCatalogHttp} from '../structured-config/structured-config-catalog.fixture'

export class SemiStructuredHttp extends StructuredCatalogHttp {
  override post<T>(url: string, data?: unknown): Promise<T> {
    if (url.includes('GetJson')) return this.trackAndReturn(url, data, {items: [{id: 'root', name: 'root'}]} as T)
    if (url.includes('SaveJsonData')) return this.trackAndReturn(url, data, {} as T)
    if (url.includes('ExcelImport/ReadDesign')) return this.trackAndReturn(url, data, {layout: [{sheet: 'S1'}], rules: []} as T)
    if (url.includes('ExcelImport/WriteDesign')) return this.trackAndReturn(url, data, {} as T)
    if (url.includes('PdfInspect/ReadRule')) return this.trackAndReturn(url, data, {rule: {pattern: '.*'}} as T)
    if (url.includes('PdfInspect/WriteRule')) return this.trackAndReturn(url, data, {} as T)
    return super.post(url, data)
  }
  private trackAndReturn<T>(url: string, data: unknown, value: T): Promise<T> {
    this.posts.push({url, data})
    return Promise.resolve(value)
  }
}
