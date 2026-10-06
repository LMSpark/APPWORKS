import { createTestPageRuntime } from './create-test-page-runtime'
import { mount } from '@vue/test-utils'
import type { ComponentMountingOptions } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { Component } from 'vue'
import {
  DATA_ROW,
  DATA_SOURCE,
  PAGE_SERVICE,
  PAGE_RUNTIME,
  SPARK_REGISTRY_KEY,
  Spark,
  useSparkComponent,
} from '@spark-appworks/spark-component'
import { SUBTREE_FIELD_POLICY } from '../../packages/spark-component/src/permission'
import type { ComponentRegistry, PageServiceCapability } from '@spark-appworks/spark-component'
import type { CapabilityContext } from '@spark-appworks/spark-utils'
import type { DataRow, DataSetContract, DataView, SparkNode } from '@spark-appworks/spark-data'

type MountFieldInContextOptions = {
  component: Component
  type: string
  model: DataRow
  fieldName: string
  componentProps?: Record<string, unknown> | undefined
  global?: ComponentMountingOptions<unknown>['global'] | undefined
  pageDataSet?: DataSetContract | undefined
  dataSource?: DataView
  pageService?: PageServiceCapability | undefined
  hostType?: string | undefined}

type SparkTestSystem = {
  registry: ComponentRegistry
  rootContext: CapabilityContext}

function createTestSystem(): SparkTestSystem {
  return Spark.createSystem()
}

export function mountFieldInContext(options: MountFieldInContextOptions) {
  const { registry, rootContext } = createTestSystem()
  const globalOptions = options.global ?? {}
  const providedValues = globalOptions.provide ?? {}

  const Provider = defineComponent({
    setup() {
      const hostType = options.hostType ?? 'r-form'
      const node: SparkNode = { type: hostType }
      const { sparkProvide } = useSparkComponent(node, { parentContext: rootContext })
      sparkProvide(DATA_ROW, options.model)

      if (options.pageDataSet !== undefined) {
        sparkProvide(PAGE_RUNTIME, createTestPageRuntime(options.pageDataSet))
      }
      if (options.dataSource !== undefined) {
        sparkProvide(DATA_SOURCE, options.dataSource)
      } else {
        sparkProvide(SUBTREE_FIELD_POLICY, 'unrestricted')
      }
      if (options.pageService !== undefined) {
        sparkProvide(PAGE_SERVICE, options.pageService)
      }

      return () => h(options.component, {
        type: options.type,
        field: options.fieldName,
        ...(options.componentProps ?? {}),
      })
    },
  })

  return mount(Provider, {
    global: {
      ...globalOptions,
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
        ...providedValues,
      },
    },
  })
}
