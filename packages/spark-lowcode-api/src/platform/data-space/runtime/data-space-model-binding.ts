/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/data-space-model-binding
 * 职责：正式模型首次绑定时选择来源分页读取或服务命令模式。
 * 边界：读取适配只消费原正式读取结果，不提供保存能力或权限构造入口。
 */
import type {DataRow,DataView,QueryParams} from '@spark-appworks/spark-data'
import type {DataSpaceQueryContext} from './query/data-space-query-context'
/** 只读分页来源适配；下一页须由来源实际探测确认，结果必须来自本次read能力。 */
export type DataSpaceModelReadAdapter=Readonly<{
 kind:'paged-read'
 execute(input:Readonly<{view:DataView;params:Readonly<QueryParams>;read:(params:QueryParams)=>Promise<DataSpaceQueryContext>}>):Promise<Readonly<{result:DataSpaceQueryContext;nextPageAvailable:boolean}>>
}>
/** 数组与服务适配互斥；命令模式不能通过普通查询入口执行。 */
export type DataSpaceModelBindingOptions=Readonly<{
 arrayRows?:readonly DataRow[]
 adapter?:DataSpaceModelReadAdapter|Readonly<{kind:'command'}>
}>
