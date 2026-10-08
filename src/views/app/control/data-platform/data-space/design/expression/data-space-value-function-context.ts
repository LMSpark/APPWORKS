import { getDataViewFilterFunctionDefinitions } from '@spark-appworks/spark-data'
import type { DataViewFilterFunctionContext } from '@spark-appworks/spark-data'

type FilterFunctionDefinition = NonNullable<DataViewFilterFunctionContext['definitions']>[number]

const departmentFunction = createDepartmentFunction()

function createDepartmentFunction(): FilterFunctionDefinition | undefined {
  const definition = getDataViewFilterFunctionDefinitions({}).find(item => item.type === 'GetUserMasterId')
  if (!definition) return undefined
  const fields = definition.fields.flatMap(field => {
    if (field.key === 'roleClassId') return []
    if (field.key === 'refType') return [{ ...field, options: [{ label: '部门级别', value: 'dep' }] }]
    return [field]
  })
  return { ...definition, fields, validate: value => value['refType'] === 'dep'
    ? null : '该存量值属于已停用的角色分类分支，不能通过部门过滤编辑器应用' }
}

/** 供数据空间 Filter 与字段 ValueFun 共用可编辑目录。 */
export function createDataSpaceValueFunctionContext(
  functionContext?: DataViewFilterFunctionContext,
): DataViewFilterFunctionContext {
  const sourceContext = functionContext ?? {}
  const systemData = getDataViewFilterFunctionDefinitions({}).find(item => item.type === 'SystemData')
  const parameterField = systemData?.fields.find(field => field.key === 'ParamName')
  const builtInOptions = parameterField?.options
  const defaults = typeof builtInOptions === 'function'
    ? builtInOptions({ Type: 'SystemData' }, {})
    : builtInOptions ?? []
  const optionsByValue = new Map([...(sourceContext.systemParams ?? []), ...defaults]
    .map(option => [option.value, option] as const))
  const context: DataViewFilterFunctionContext = {
    ...sourceContext,
    systemParams: [...optionsByValue.values()],
  }
  const definitions = getDataViewFilterFunctionDefinitions(context)
    .filter(item => item.type !== 'GetUserMasterId')
  return { ...context, definitions: departmentFunction ? [...definitions, departmentFunction] : definitions }
}
