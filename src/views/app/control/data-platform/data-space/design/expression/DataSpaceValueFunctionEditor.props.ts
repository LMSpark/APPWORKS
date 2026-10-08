import type { DataViewFilterFunctionContext } from '@spark-appworks/spark-data'

export type DataSpaceValueFunctionEditorProps = {
  contextKey: string
  modelValue?: string | null
  functionContext?: DataViewFilterFunctionContext
  disabled?: boolean
}
