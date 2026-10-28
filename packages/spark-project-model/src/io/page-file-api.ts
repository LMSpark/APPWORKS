/**
 * @module @spark-appworks/spark-project-model:io/page-file-api
 * 职责：三文件读取与保存的宿主语义网关。
 * 边界：能力由宿主注入，缺失即明确拒绝。
 * AI用途：通过Workspace读取页面文件；文件写操作由正式SPARK data命令承接。
 */
/** 页面文件写能力的注入式领域边界；项目模型不拥有服务器路径。 */

import type { PageFileReader } from './page-content-loader'
import type { PageToolFileName } from '../page/page-file'
import { assertNonEmptyPageId } from '../page/page-file'

/** 宿主真实三文件及编号快照能力；编号最大值不能视为正式发布。 */
export type ProjectPageFileGateway = Readonly<{
  readPageFile: PageFileReader
  saveFileContent?: (pageId: string, filename: PageToolFileName, content: string) => Promise<void>
}>

function unavailable(capability: string): never {
  throw new Error(`当前平台未提供受治理的页面文件${capability}能力`)
}

/** 三文件及编号快照操作门面，真实IO由注入网关执行。 */
export class PageFileApi {
  /** 绑定宿主真实三文件能力，缺失操作明确失败。 */
  public constructor(private readonly gateway: ProjectPageFileGateway) {}

  public async saveFileContent(pageId: string, filename: PageToolFileName, content: string): Promise<void> {
    const operation = this.gateway.saveFileContent ?? unavailable('保存')
    await operation(assertNonEmptyPageId(pageId), filename, content)
  }

}
