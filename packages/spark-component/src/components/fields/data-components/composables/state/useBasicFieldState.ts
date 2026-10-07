/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/state/useBasicFieldState
 * 职责：提供 useBasicFieldState（未注册组件类型）相关的组合式状态或行为封装，复用字段值、选项、权限、动作和交互控制逻辑。
 * 边界：只服务 field-level/data-field 的 setup/runtime 组合，不直接声明页面配置，也不替代组件 props。
 * AI用途：需要理解 use basic field state 的响应式状态来源、值转换或事件副作用时，使用本模块定位实际运行规则。
 */
import type { SparkFieldSemanticProps, SparkNodeProps } from '../../../../shared-types.js'
import { useFieldPermission } from '../../../context/useFieldPermission'
import type { FieldPermissionProps } from '../../../context/useFieldPermission'
import type { FieldComposableProps } from '../../../context/field-composable-props'
import { useFieldControlState } from './useFieldControlState'

/** Basic Field Props 的属性契约。 */
type BasicFieldProps<TValue> = FieldPermissionProps<TValue> & FieldComposableProps<Pick<SparkNodeProps,
    | 'type' | 'children'
  >> & FieldComposableProps<Pick<SparkFieldSemanticProps,
    | 'width'
    | 'resizable'
    | 'titleAlign' | 'valueAlign'
    | 'headerCellClassName' | 'cellClassName'
    | 'titleClassName' | 'valueClassName'
    | 'sortable'
  >>

/** Use Basic Field State Options 的调用配置。 */
type UseBasicFieldStateOptions<TValue> = {
    /** 组件属性集合。 */
props: BasicFieldProps<TValue>
    /** field Type 字段。 */
fieldType: string
    /** fallback Value 字段。 */
fallbackValue: TValue
    /** emit Update 回调。 */
emitUpdate: (value: TValue) => void
    /** format Display 回调。 */
formatDisplay?: (value: unknown) => string
    /** coerce 回调。 */
coerce: (rawValue: unknown) => TValue}

export function useBasicFieldState<TValue>(options: UseBasicFieldStateOptions<TValue>) {
  const permission = useFieldPermission<TValue>({
    props: options.props,
    type: options.fieldType,
    fallbackValue: options.fallbackValue,
    coerce: options.coerce,
    ...(options.formatDisplay !== undefined ? { formatDisplay: options.formatDisplay } : {}),
  })

  const { fieldCtx, handleControlledChange } = useFieldControlState<TValue>({
    props: options.props,
    fieldType: options.fieldType,
    state: permission,
    emitUpdate: value => options.emitUpdate(value),
  })

  return {
    permission,
    fieldCtx,
    handleControlledChange,
  }
}
