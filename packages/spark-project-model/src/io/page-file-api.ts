/** 页面文件写能力的注入式领域边界；项目模型不拥有服务器路径。 */

import type { PageFileReader } from './page-content-loader'
import type {
  PageFileCreateOptions,
  PageNodeFileName,
  PageNodeFileVersionSummary,
} from '../page/page-file'
import { assertNonEmptyPageId } from '../page/page-file'

export type PageFileCreateParams = PageFileCreateOptions & { pageId: string }

export type ProjectPageFileGateway = Readonly<{
  readPageFile: PageFileReader
  saveFileContent?: (pageId: string, filename: PageNodeFileName, content: string) => Promise<void>
  createFiles?: (params: PageFileCreateParams) => Promise<Record<string, unknown>>
  deleteFiles?: (pageId: string) => Promise<void>
  listVersions?: (pageId: string, filename: PageNodeFileName) => Promise<PageNodeFileVersionSummary[]>
  restoreVersion?: (pageId: string, filename: PageNodeFileName, version: number) => Promise<void>
  createVersion?: (pageId: string, filename: PageNodeFileName) => Promise<void>
  deleteVersion?: (pageId: string, filename: PageNodeFileName, version: number) => Promise<void>
}>

function unavailable(capability: string): never {
  throw new Error(`当前平台未提供受治理的页面文件${capability}能力`)
}

function assertPositiveVersion(version: number): void {
  if (!Number.isInteger(version) || version <= 0) throw new Error('version must be a positive integer')
}

export class PageFileApi {
  public constructor(private readonly gateway: ProjectPageFileGateway) {}

  public async saveFileContent(pageId: string, filename: PageNodeFileName, content: string): Promise<void> {
    const operation = this.gateway.saveFileContent ?? unavailable('保存')
    await operation(assertNonEmptyPageId(pageId), filename, content)
  }

  public async createFiles(params: PageFileCreateParams): Promise<Record<string, unknown>> {
    const operation = this.gateway.createFiles ?? unavailable('创建')
    return operation({ ...params, pageId: assertNonEmptyPageId(params.pageId) })
  }

  public async deleteFiles(pageId: string): Promise<void> {
    const operation = this.gateway.deleteFiles ?? unavailable('删除')
    await operation(assertNonEmptyPageId(pageId))
  }

  public async listVersions(pageId: string, filename: PageNodeFileName): Promise<PageNodeFileVersionSummary[]> {
    const operation = this.gateway.listVersions ?? unavailable('版本读取')
    return operation(assertNonEmptyPageId(pageId), filename)
  }

  public async restoreVersion(pageId: string, filename: PageNodeFileName, version: number): Promise<void> {
    assertPositiveVersion(version)
    const operation = this.gateway.restoreVersion ?? unavailable('版本恢复')
    await operation(assertNonEmptyPageId(pageId), filename, version)
  }

  public async createVersion(pageId: string, filename: PageNodeFileName): Promise<void> {
    const operation = this.gateway.createVersion ?? unavailable('版本创建')
    await operation(assertNonEmptyPageId(pageId), filename)
  }

  public async deleteVersion(pageId: string, filename: PageNodeFileName, version: number): Promise<void> {
    assertPositiveVersion(version)
    const operation = this.gateway.deleteVersion ?? unavailable('版本删除')
    await operation(assertNonEmptyPageId(pageId), filename, version)
  }
}
