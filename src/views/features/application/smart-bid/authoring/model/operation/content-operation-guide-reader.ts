/**
 * @module app:views/features/application/smart-bid/authoring/model/operation/content-operation-guide-reader
 * 职责：页18第01项沿当前 ClassModel 发现当前根可达指南。
 * 边界：ClassModel 是知识真源，不建立 KnowledgeGuide 数据视图。
 * AI用途：核对目录和指南是否来自同一 ClassModel 版本。
 */
import {discoverOperationGuides} from '@/services/smart-bid/operation/guides/operation-guide-discovery'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {ContentRevisionReadHost} from '../content-revision-reader'

/** 当前 ClassModel 可达动作定义。 */
type Discovery = Parameters<typeof discoverOperationGuides>

/** 目录、动作指南及 digest 由同一 ClassModel query/actionGuide 回读。 */
export async function discoverRegisteredOperationGuides(host:ContentRevisionReadHost,runtime:Discovery[0],
 selection:Readonly<{directoryRef:string;rootKind:string}>){
 const {scenarioId,projectId}=host,{directoryRef,rootKind}=selection
 host.assertCurrent()
 if(![scenarioId,projectId,directoryRef,rootKind].every(identity))throw Error('OPERATION_GUIDE_DIRECTORY_SCOPE')
 return discoverOperationGuides(runtime,{rootKind,directoryRef,assertCurrent:host.assertCurrent})
}
