/**
 * @module @spark-appworks/spark-component:components/containers/support/scope/row-item-context
 * 职责：标识集合行项的自定义动作参数，区别普通表单和弹窗命令事件。
 * 边界：只携带所属视图和原行定位函数，不授予权限，不按主键认领替换记录。
 */
import type {InjectionKey} from 'vue'
import type {DataRow,DataView} from '@spark-appworks/spark-data'

/** 行项动作只消费自己的视图；其它视图中的按钮仍为普通命令。 */
export const ROW_ITEM_CONTEXT:InjectionKey<Readonly<{
 view:()=>DataView|null
 row:()=>DataRow|null
}>>=Symbol('spark-row-item-context')
