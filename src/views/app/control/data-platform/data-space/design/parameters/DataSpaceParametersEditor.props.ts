export type DataSpaceParameterItem = Readonly<Record<string, unknown>>

export type DataSpaceParameterUpdate = Readonly<{
  index: number
  item: DataSpaceParameterItem
  field: 'Name' | 'Description' | 'IsBusParam'
  value: unknown
}>

export type DataSpaceParametersEditorProps = Readonly<{
  modelValue: readonly DataSpaceParameterItem[]
  disabled?: boolean
}>
