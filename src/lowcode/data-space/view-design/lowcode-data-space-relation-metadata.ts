/**
 * @module app:lowcode/data-space/view-design/lowcode-data-space-relation-metadata
 * 职责：接入元数据空间的原生关系定义视图和只读画布端点。
 * 边界：旧关系只作为导入来源；编辑和保存完整本仓结构，不反向改写旧数据库记录。
 * AI用途：通过DataResourceRelationDefinition绑定编辑DataResourceRelation。
 */
import type {DataResourceRelation, DataSet, DataView} from '@spark-appworks/spark-data'
import type {ScenarioViewFile} from '@spark-appworks/spark-project-model'
import type {ScenarioDefinitionResource} from '@spark-appworks/spark-project-model'

/** 接入原生关系定义视图；导入来源不限制原生关系结构编辑。 */
export class LowcodeDataSpaceRelationMetadata {
  /** 元数据表的稳定名称，不是后端注册模型。 */
  static readonly tableName = 'DataResourceRelationDefinition'
  readonly #view: DataView
  readonly #graph: DataView

  /** 使用正式元数据DataSet的定义视图，编辑与保存由原生数据链承接。 */
  constructor(dataSet: DataSet, private readonly resource: ScenarioDefinitionResource) {
    const table = dataSet.getTable(LowcodeDataSpaceRelationMetadata.tableName)
    const view = table?.getView('default')
    if (table?.resourceType !== 'file' || !view) throw new Error('DATA_SPACE_RELATION_METADATA_VIEW: 正式配置缺少文件关系定义视图')
    this.#view = view
    view.commitMode = 'staged'
    view.pk.setPrimaryKeyGenerator({strategy: 'uuid', fields: 'definitionKey'})
    this.#graph = table.getOrCreateView('graph')
  }

  /** 拒绝工作区刷新覆盖尚未保存的关系编辑。 */
  assertClean(): void { this.#view.assertResultReplacementAllowed() }

  /**
   * 投影只读画布端点，不补造过滤表达式，也不改变完整关系编辑基线。
   * @param file 当前正式文件owner；null清除失效显示。
   * @param endpoints 已按文件及正式模型身份核定的关系端点；行键与完整关系定义一致。
   */
  async resetGraph(file: ScenarioViewFile | null, endpoints: ReadonlyArray<Pick<DataResourceRelation, 'relationId' | 'sourceRelationId' | 'parentTable' | 'childTable'>>): Promise<void> {
    if (!file) {this.#graph.clearAll(); return}
    this.resource.useRelationEndpoints(file, endpoints)
    await this.#graph.refresh()
    if (this.#graph.loadingError) throw this.#graph.loadingError
  }

  /** 从同一文件与当次装配关系重建；未解析的文件来源引用仍保留，允许显式修复。 */
  async reset(file: ScenarioViewFile | null, resolved?: readonly DataResourceRelation[]): Promise<void> {
    const revision = file?.revision, text = file?.getText()
    const assertCurrent = (): void => {
      if (file && (file.revision !== revision || file.getText() !== text)) {
        throw new Error('DATA_SPACE_DESIGN_SESSION_STALE: 关系读取期间视图配置已改变')
      }
    }
    await this.#view.refresh()
    if (this.#view.loadingError) throw this.#view.loadingError
    assertCurrent()
    await this.resetGraph(file, resolved ?? (file?.value.usesNativeResourceRelations ? file.value.resolveResourceRelationEndpoints([]) : []))
    assertCurrent()
  }
}
