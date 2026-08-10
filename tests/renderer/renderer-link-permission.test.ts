import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import {
  DATA_SOURCE,
  SPARK_REGISTRY_KEY,
  Spark,
  RendererLink,
  useSparkComponent,
} from '@spark-appworks/spark-component'
import { SparkData, type DataView, type SparkNode } from '@spark-appworks/spark-data'

const ElLinkStub = defineComponent({
  props: ['type', 'underline', 'disabled', 'href', 'target'],
  setup(props, { slots }) {
    return () => h('a', {
      class: 'el-link-stub',
      'data-disabled': String(Boolean(props.disabled)),
      'data-href': String(props.href ?? ''),
    }, slots['default']?.())
  },
})

function mountRendererLinkWithDataSource(dataSource: DataView, componentProps?: Record<string, unknown>) {
  const { registry, rootContext } = Spark.createSystem()

  const Provider = defineComponent({
    setup() {
      const node: SparkNode = { type: 'r-toolbar' }
      const { sparkProvide } = useSparkComponent(node, { parentContext: rootContext })
      sparkProvide(DATA_SOURCE, dataSource)

      return () => h(RendererLink, {
        type: 'r-link',
        label: '批量删除',
        permissionDeniedMode: 'disable',
        ...(componentProps ?? {}),
      })
    },
  })

  return mount(Provider, {
    global: {
      stubs: {
        'el-link': ElLinkStub,
      },
      provide: {
        [SPARK_REGISTRY_KEY]: registry,
      },
    },
  })
}

describe('RendererLink 权限作用域', () => {
  it('多选工具栏应按 selectedRows 做行权限裁决，而不是只看 currentRow', () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'RendererLinkPermissionDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number', isPrimaryKey: true },
            { name: 'name', type: 'string' },
          ],
          views: {
            default: {
              rows: [
                { id: 1, name: '允许行', lingma_sys_params: { r: [], e: [], h: [], m: [], d: true } },
                { id: 2, name: '拒绝行', lingma_sys_params: { r: [], e: [], h: [], m: [], d: false } },
              ],
            },
          },
        },
      },
    })

    const view = dataSet.getView('Users', 'default')!
    view.setCurrentRowById(1)
    view.setSelectedRows(view.rows.slice())

    const wrapper = mountRendererLinkWithDataSource(view, {
      action: 'delete-selected',
    })

    const link = wrapper.find('.el-link-stub')
    expect(link.exists()).toBe(true)
    expect(link.attributes('data-disabled')).toBe('true')
  })
})
