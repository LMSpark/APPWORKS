/**
 * @module app:lowcode/data-space/view-design/lowcode-data-space-cascade-metadata
 * 职责：接入元数据空间中两种原生值级联的定义视图。
 * 边界：复用定义DataView的编辑与保存，不从模型关系推导级联或存储运行值。
 * AI用途：通过DataViewCascadeDefinition维护query/field定义。
 */
import type {DataSet, DataView} from '@spark-appworks/spark-data'

/** 文件所属的输入级联元模型；结构化属性保留原生定义形状。 */
export class LowcodeDataSpaceCascadeMetadata {
  /** 正式元数据配置中的文件资源表键，不是后端模型注册名。 */
  static readonly tableName = 'DataViewCascadeDefinition'
  readonly #view: DataView

  /** 使用正式定义视图；原生记录键使没有cascadeId的既有query记录也能编辑。 */
  constructor(dataSet: DataSet) {
    const view = dataSet.getView(LowcodeDataSpaceCascadeMetadata.tableName, 'default')
    if (!view || view.dataTable?.resourceType !== 'file') throw new Error('DATA_SPACE_CASCADE_METADATA_VIEW: 正式配置缺少文件级联定义视图')
    this.#view = view
    view.commitMode = 'staged'
    view.pk.setPrimaryKeyGenerator({strategy: 'uuid', fields: 'definitionKey'})
  }

  /** 防止工作区刷新覆盖尚未保存的级联编辑。 */
  assertClean(): void { this.#view.assertResultReplacementAllowed() }

  /** 经原DataView重新查询定义；不向缺省query配置补kind或cascadeId。 */
  async reset(): Promise<void> {
    await this.#view.refresh()
    if (this.#view.loadingError) throw this.#view.loadingError
  }
}
