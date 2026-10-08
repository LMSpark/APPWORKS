import type { DataColumn, DataViewFilterFunctionContext } from '@spark-appworks/spark-data'

export type DataSpaceFilterEditorProps = {
  contextKey: string
  modelValue?: string | null
  columns: readonly DataColumn[]
  functionContext?: DataViewFilterFunctionContext
  disabled?: boolean
}

export type DataSpaceFilterEditorValidation = {
  contextKey: string
  value: string | null | undefined
  valid: boolean
  message: string
}
