/**
 * 字段 composable 接收的 Vue props 投影。
 * 属性既可缺失，也可由 Vue 运行时显式提供 undefined。
 */
export type FieldComposableProps<T> = {
  [K in keyof T]?: T[K] | undefined
}
