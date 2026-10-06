/**
 * @module @spark-appworks/spark-project-model:io/page-file-api
 * 职责：三文件保存与编号快照语义网关。
 * 边界：能力由宿主注入，缺失即明确拒绝。
 * AI用途：通过Workspace保存三文件或管理N__filename快照。
 */
/** 页面文件写能力的注入式领域边界；项目模型不拥有服务器路径。 */

import type { PageFileReader } from './page-content-loader'
import type {
  PageFileCreateOptions,
  PageToolFileName,
  PageToolFileVersionSummary,
} from '../page/page-file'
import { assertNonEmptyPageId } from '../page/page-file'

/** 为明确pageId创建三工具文件的真实请求。 */
export type PageFileCreateParams = PageFileCreateOptions & { pageId: string }

/** 宿主真实三文件及编号快照能力；编号最大值不能视为正式发布。 */
export type ProjectPageFileGateway = Readonly<{
  readPageFile: PageFileReader
  saveFileContent?: (pageId: string, filename: PageToolFileName, content: string) => Promise<void>
  createFiles?: (params: PageFileCreateParams) => Promise<Record<string, unknown>>
  deleteFiles?: (pageId: string) => Promise<void>
  listVersions?: (pageId: string, filename: PageToolFileName) => Promise<PageToolFileVersionSummary[]>
  restoreVersion?: (pageId: string, filename: PageToolFileName, version: number) => Promise<void>
  createVersion?: (pageId: string, filename: PageToolFileName) => Promise<void>
  deleteVersion?: (pageId: string, filename: PageToolFileName, version: number) => Promise<void>
}>

function unavailable(capability: string): never {
  throw new Error(`当前平台未提供受治理的页面文件${capability}能力`)
}

function assertFileVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('version must be a non-negative safe integer')
}

/** 三文件及编号快照操作门面，真实IO由注入网关执行。 */
export class PageFileApi {
  /** 绑定宿主真实三文件能力，缺失操作明确失败。 */
  public constructor(private readonly gateway: ProjectPageFileGateway) {}

  public async saveFileContent(pageId: string, filename: PageToolFileName, content: string): Promise<void> {
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

  public async listVersions(pageId: string, filename: PageToolFileName): Promise<PageToolFileVersionSummary[]> {
    const operation = this.gateway.listVersions ?? unavailable('版本读取')
    return operation(assertNonEmptyPageId(pageId), filename)
  }

  public async restoreVersion(pageId: string, filename: PageToolFileName, version: number): Promise<void> {
    assertFileVersion(version)
    const operation = this.gateway.restoreVersion ?? unavailable('版本恢复')
    await operation(assertNonEmptyPageId(pageId), filename, version)
  }

  public async createVersion(pageId: string, filename: PageToolFileName): Promise<void> {
    const operation = this.gateway.createVersion ?? unavailable('版本创建')
    await operation(assertNonEmptyPageId(pageId), filename)
  }

  public async deleteVersion(pageId: string, filename: PageToolFileName, version: number): Promise<void> {
    assertFileVersion(version)
    const operation = this.gateway.deleteVersion ?? unavailable('版本删除')
    await operation(assertNonEmptyPageId(pageId), filename, version)
  }
}
