import type {DataSpaceModelFieldsProps} from '../fields/DataSpaceModelFields.props'

/** 同一模型绑定定义的编辑区；两种呈现复用DataView查询、草稿及保存。 */
export type DataSpaceTableConfigurationProps = DataSpaceModelFieldsProps & {
  /** 默认requests编辑api/crudConfig，columns编辑本地字段定义。实例生命周期内不切换。 */
  section?: 'requests' | 'columns'
}
