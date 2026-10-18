export type DataSpaceParametersEditorProps = Readonly<{
  /** 原inputParams记录所属视图；标准JSON字段直接编辑currentRow.inputParams。 */
  dataViewKey: string
  disabled?: boolean
  /** 尚有未确认行草稿时阻止外层保存；外层取消可销毁该编辑器。 */
  onEditingChange?: (editing: boolean) => void
}>
