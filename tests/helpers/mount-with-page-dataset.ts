import { mount } from '@vue/test-utils'
import type { ComponentMountingOptions } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { Component } from 'vue'
import { PAGE_RUNTIME_SERVICES } from '@spark-appworks/spark-component'
import { PAGE_COMPONENT_REGISTRY, PAGE_DATASET, Spark, useSparkComponent } from '@spark-appworks/spark-component'
import type { DataSetContract, DataView } from '@spark-appworks/spark-data'
import type { PageComponentRegistry } from '@spark-appworks/spark-component'
import { createPageComponentRegistry } from '../../packages/spark-component/src/page/context/page-component-registry'
import type { SparkNode } from '@spark-appworks/spark-data'

const TEST_APP_LOGGER = {
  debug: (message: string, context?: unknown) => console.info(message, context),
  info: (message: string, context?: unknown) => console.info(message, context),
  warn: (message: string, context?: unknown) => console.warn(message, context),
  error: (message: string, context?: unknown) => console.error(message, context),
}

type MountedWithPageDataSetWrapper = VueWrapper & {
  __pageComponentRegistry?: PageComponentRegistry}

type MountWithPageDataSetOptions = {
  dataSet: DataSetContract
  props?: Record<string, unknown>
  global?: ComponentMountingOptions<unknown>['global']
  slots?: Record<string, unknown>}

export function mountWithPageDataSet(
  component: Component,
  options: MountWithPageDataSetOptions,
) : MountedWithPageDataSetWrapper {
  const registry = Spark.createRegistry()
  const plugin = Spark.createPlugin({ registry })
  const pageComponentRegistry = createPageComponentRegistry()

  const Harness = defineComponent({
    setup() {
      const node: SparkNode = { type: 'test-page-root' }
      const { sparkProvide } = useSparkComponent(node)
      sparkProvide(PAGE_DATASET, options.dataSet)
      sparkProvide(PAGE_COMPONENT_REGISTRY, pageComponentRegistry)
      sparkProvide(PAGE_RUNTIME_SERVICES, { logger: TEST_APP_LOGGER })
      return () => h(component, options.props ?? {}, options.slots ?? {})
    },
  })

  const wrapper = mount(Harness, {
    global: {
      plugins: [plugin],
      ...options.global,
    },
  })

  const componentWrapper = Object.assign(wrapper.findComponent(component), {
    __pageComponentRegistry: pageComponentRegistry,
  })
  return componentWrapper
}

export function getMountedComponentApi<T>(
  wrapper: MountedWithPageDataSetWrapper,
  type: string,
  index = 0,
): T {
  const registry = wrapper.__pageComponentRegistry
  if (!registry) {
    throw new Error('mountWithPageDataSet 未附带 PAGE_COMPONENT_REGISTRY。')
  }

  const apis = registry.getApisByType<T>(type)
  const api = apis[index]
  if (!api) {
    throw new Error(`未找到已注册的组件 API: type=${type}, index=${index}`)
  }
  return api
}

type MountWithDataViewOptions = {
  view: DataView
  field?: 'rows' | 'currentRow'
  props?: Record<string, unknown>
  global?: ComponentMountingOptions<unknown>['global']
  slots?: Record<string, unknown>}

export function mountWithDataView(
  component: Component,
  options: MountWithDataViewOptions,
) {
  const dataSet = options.view.dataSet
  if (!dataSet) {
    throw new Error('mountWithDataView 仅支持已附着到 DataSet 的 DataView。')
  }

  const field = options.field ?? 'rows'
  const dataViewKey = `${options.view.tableName}@${options.view.viewId}`
  const mountOptions: MountWithPageDataSetOptions = {
    dataSet,
    props: {
      ...options.props,
      dataViewKey,
      ...(field === 'currentRow' ? { contextDataMember: 'currentRow' } : {}),
    },
  }

  if (options.global) {
    mountOptions.global = options.global
  }
  if (options.slots) {
    mountOptions.slots = options.slots
  }

  return mountWithPageDataSet(component, mountOptions)
}

