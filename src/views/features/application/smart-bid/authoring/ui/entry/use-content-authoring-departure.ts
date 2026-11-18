/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/use-content-authoring-departure
 * 职责：将页11原宿主/命令的脏状态交现有路由及系统页关闭保护。
 * 边界：只注册原owner的只读守卫，不保存草稿、不自动丢弃、不新建页面实例池。
 * AI用途：薄宿主setup内调用；正式工具宿主关闭机制仍须公共层挂接。
 */
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import type {ContentAuthoringCommands} from './content-authoring-commands'
import type {ContentAuthoringHost} from '../../model/content-authoring-host'

/** 同时覆盖未确认编辑输入、原DataView变更和宿主装配阶段的pending。 */
export function useContentAuthoringDeparture(host:Pick<ContentAuthoringHost,'hasPending'>,commands:()=>Pick<ContentAuthoringCommands,'canLeave'>|undefined):void {
 const isDirty=()=>host.hasPending||commands()?.canLeave===false
 useSystemPageDirtySource({get isDirty(){return isDirty()}})
 onBeforeRouteLeave(()=>!isDirty())
 onBeforeRouteUpdate(()=>!isDirty())
}
