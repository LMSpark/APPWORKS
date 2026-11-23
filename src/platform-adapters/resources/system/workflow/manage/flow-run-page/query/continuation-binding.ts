/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/query/continuation-binding
 * 职责：按原办理选项与步骤身份读取正式自动后继判断，供业务回调消费。
 * 边界：只读判断，不派发后继办理，不把未知结果推断为false。
 */
import type {BindReadonlyCommandQueryOptions, DataView} from '@spark-appworks/spark-data'
import type {FlowRunPageClient} from '../flow-run-page-client'

export function createFlowRunContinuationBinding({view, source, client, guard}: Readonly<{view: DataView; source: DataView; client: Pick<FlowRunPageClient, 'canAutoSubmitAfter'>; guard: () => void}>): BindReadonlyCommandQueryOptions {
  const assertOwner = () => {
    guard()
    if (view.destroyed || source.destroyed || !view.dataSet || view.dataSet !== source.dataSet || view.dataSet.destroyed) throw Error('自动后继查询实例已失效')
  }
  return {resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-continuation'}, derivedQueries: 'bound-view-only', guard: assertOwner,
    captureQueryInputs: target => {
      assertOwner()
      const stepId = view.queryContext['stepId'], row = source.rows[0]
      if (target !== view || typeof stepId !== 'string' || !stepId.trim() || source.queryContext['stepId'] !== stepId || source.rows.length !== 1 || !row) throw Error('自动后继缺少原正式步骤')
      const assertSource = source.captureReadRow(row, ['payload'])
      return () => {assertOwner(); assertSource(); if (view.queryContext['stepId'] !== stepId || source.queryContext['stepId'] !== stepId) throw Error('自动后继步骤已变化')}
    },
    loadRows: async () => {
      const stepId = view.queryContext['stepId']
      if (typeof stepId !== 'string' || !stepId) throw Error('自动后继缺少步骤')
      const enableNext = await client.canAutoSubmitAfter(stepId)
      assertOwner()
      if (typeof enableNext !== 'boolean') throw Error('自动后继判断未返回正式布尔结果')
      return [{id: 'current', enableNext}]
    },
  }
}
