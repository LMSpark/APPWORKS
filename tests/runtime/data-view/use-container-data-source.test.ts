import { computed, effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { CrudApi, TableResourceType } from '@spark-appworks/spark-data'
import { useContainerDataSourceEffects } from '../../../packages/spark-component/src/components/containers/data-views/view-data-source'
import type { DataViewMemberDiagnostic } from '@spark-appworks/spark-data'

type AutoLoadViewLike = {
  autoLoad?: boolean
  autoLoadConfigured?: boolean
  requestData: () => Promise<void>
  dataTable?: {
    api?: CrudApi
    resourceType?: TableResourceType
  }}

function createSource(options?: {
  autoLoad?: boolean
  resourceType?: TableResourceType
  api?: CrudApi
}) {
  const requestData = vi.fn<() => Promise<void>>().mockResolvedValue()
  const dataTable: NonNullable<AutoLoadViewLike['dataTable']> = {
    ...(options?.api !== undefined ? { api: options.api } : {}),
    ...(options?.resourceType !== undefined ? { resourceType: options.resourceType } : {}),
  }
  const source: AutoLoadViewLike = {
    requestData,
    ...(options?.autoLoad !== undefined ? { autoLoad: options.autoLoad } : {}),
    ...(options?.autoLoad !== undefined ? { autoLoadConfigured: true } : {}),
    dataTable,
  }
  return { source, requestData }
}

async function mountAutoLoadEffect(source: AutoLoadViewLike | null) {
  const scope = effectScope()
  const logger = {
    warn: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string, error?: unknown) => void>(),
  }

  scope.run(() => {
    const resolvedView = ref<AutoLoadViewLike | null>(source)
    useContainerDataSourceEffects<AutoLoadViewLike>({
      resolvedView: computed(() => resolvedView.value),
      logger,
      logPrefix: 'test',
    })
  })

  await nextTick()
  return { scope, logger }
}

async function mountDiagnosticEffect(diagnostic: DataViewMemberDiagnostic | null) {
  const scope = effectScope()
  const logger = {
    warn: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string, error?: unknown) => void>(),
  }

  scope.run(() => {
    const resolvedDiagnostic = ref<DataViewMemberDiagnostic | null>(diagnostic)
    useContainerDataSourceEffects<AutoLoadViewLike>({
      resolvedView: computed(() => null),
      diagnostic: computed(() => resolvedDiagnostic.value),
      logger,
      logPrefix: 'test',
      skipAutoLoadEffect: true,
      skipProvideEffect: true,
    })
  })

  await nextTick()
  return { scope, logger }
}

describe('useContainerDataSourceEffects', () => {
  it('会为有远程 list API 的视图触发自动加载', async () => {
    const { source, requestData } = createSource({
      api: {
        list: {
          url: '/orders',
          method: 'GET',
        },
      },
      resourceType: 'database-table',
    })

    const { scope } = await mountAutoLoadEffect(source)

    expect(requestData).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('不会为 static-data 视图触发自动加载，即使误配了 list API', async () => {
    const { source, requestData } = createSource({
      api: {
        list: {
          url: '/voucher/list',
          method: 'GET',
        },
      },
      resourceType: 'static-data',
    })

    const { scope } = await mountAutoLoadEffect(source)

    expect(requestData).not.toHaveBeenCalled()
    scope.stop()
  })

  it('不会为 autoLoad=false 的视图触发自动加载', async () => {
    const { source, requestData } = createSource({
      autoLoad: false,
      api: {
        list: {
          url: '/orders',
          method: 'GET',
        },
      },
      resourceType: 'database-table',
    })

    const { scope } = await mountAutoLoadEffect(source)

    expect(requestData).not.toHaveBeenCalled()
    scope.stop()
  })

  it('不会为 empty-current-row 诊断输出 warn 噪音', async () => {
    const { scope, logger } = await mountDiagnosticEffect({
      ok: false,
      status: 'empty-current-row',
      rawKey: 'columns@currentRow',
      descriptor: null,
      message: 'DataMember 当前行为空: columns@currentRow',
    })

    expect(logger.warn).not.toHaveBeenCalled()
    scope.stop()
  })

  it('会继续输出结构性 DataView 诊断告警', async () => {
    const { scope, logger } = await mountDiagnosticEffect({
      ok: false,
      status: 'missing-table',
      rawKey: 'missing@rows',
      descriptor: null,
      message: 'DataViewKey 表不存在: missing',
    })

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith('test: DataViewKey 表不存在: missing')
    scope.stop()
  })
})
