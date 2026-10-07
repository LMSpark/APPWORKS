import { describe, it, expect } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { RendererForm, RendererDetail, FieldText } from '@spark-appworks/spark-component'
import { SparkData } from '@spark-appworks/spark-data'
import type { DataView } from '@spark-appworks/spark-data'
import { DataSpaceQueryTable } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import { getMountedComponentApi, mountWithPageDataSet } from '../../support/helpers/mount-with-page-dataset'
import { requireRecord, requireString } from '../../support/helpers/runtime-guards'

async function loadFieldQuery(view: DataView): Promise<void> {
  const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName: 'Users' })
  const context = new DataSpaceQueryContext({ identity: table.identity, scope: 'form', readScope: () => 'form',
    snapshot: table.applyResult({ Result: { primaryKeyField: 'id', data: { Items: view.rows, Count: view.rows.length } } }),
  })
  view.bindQueryExecutor({ executeQuery: async () => context })
  await view.loadFromServer()
}

function readConfigType(config: unknown): string {
  return requireString(requireRecord(config, 'action config')['type'], 'action config type')
}

const SparkActionStub = defineComponent({
  props: {
    config: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => h('button', {
      class: 'spark-action-stub',
      'data-type': readConfigType(props.config),
    }, readConfigType(props.config))
  },
})

const ElFormStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', { class: 'el-form-stub' }, slots['default']?.())
  },
})

const ElFormItemStub = defineComponent({
  props: {
    label: String,
    prop: String,
  },
  setup(props, { slots }) {
    return () => h('div', {
      class: 'el-form-item-stub',
      'data-label': props.label ?? '',
      'data-prop': props.prop ?? '',
    }, slots['default']?.())
  },
})

const ElInputStub = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup(props) {
    return () => h('input', {
      class: 'el-input-stub',
      value: props.modelValue,
      disabled: props.disabled,
    })
  },
})

describe('RendererForm and RendererDetail toolbar integration', () => {
  it('should render form toolbar children and default slot scopes', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'FormDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{
                id: 1,
                name: 'Alice',
                lingma_sys_params: { r: [], e: ['name'], h: [], m: [], d: false },
              }],
            },
          },
        },
      },
    })
    const formView = ds.getView('Users', 'default')!
    formView.selection.setCurrentRow(formView.rows[0] ?? null)

    const wrapper = mountWithPageDataSet(RendererForm, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
        toolbar: { type: 'r-toolbar', children: [{ type: 'form-toolbar-action' }] },
      },
      slots: {
        default: ({ model }: Record<string, unknown>) => h('div', {
          class: 'biz-form-template',
          'data-name': String(requireRecord(model, 'form slot model')['name'] ?? ''),
        }, 'biz-form-template'),
      },
      global: {
        stubs: {
          'el-form': ElFormStub,
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="form-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.find('.biz-form-template').attributes('data-name')).toBe('Alice')
  })

  it('should render structured form toolbar prop', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'FormZonePropDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }],
            },
          },
        },
      },
    })
    const formView = ds.getView('Users', 'default')!
    formView.selection.setCurrentRow(formView.rows[0] ?? null)

    const wrapper = mountWithPageDataSet(RendererForm, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
        toolbar: { type: 'r-toolbar', children: [{ type: 'form-toolbar-prop-action' }] },
      },
      global: {
        stubs: {
          'el-form': ElFormStub,
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="form-toolbar-prop-action"]').exists()).toBe(true)
  })

  it('should allow direct Vue children to render R fields inside RendererForm slot', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'FormDirectVueDS',
      scenarioId: 'SCENE',
      tables: {
        Users: {
          tableName: 'Users',
          modelBinding: { modelId: 'MODEL', modelName: 'Users' },
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{
                id: 1,
                name: 'Alice',
                lingma_sys_params: { r: [], e: ['name'], h: [], m: [], d: false },
              }],
            },
          },
        },
      },
    })
    const formView = ds.getView('Users', 'default')!
    await loadFieldQuery(formView)
    formView.selection.setCurrentRow(formView.rows[0] ?? null)

    const DirectFormFields = defineComponent({
      name: 'DirectFormFields',
      setup() {
        return () => h(FieldText, {
          type: 'r-text',
          field: 'name',
          label: '姓名',
        })
      },
    })

    const wrapper = mountWithPageDataSet(RendererForm, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
      },
      slots: {
        default: () => h(DirectFormFields),
      },
      global: {
        stubs: {
          'el-form': ElFormStub,
          'el-form-item': ElFormItemStub,
          'el-input': ElInputStub,
        },
      },
    })

    expect(wrapper.find('.el-form-item-stub[data-prop="name"]').exists()).toBe(true)
    expect(wrapper.find('.el-form-item-stub').attributes('data-label')).toBe('姓名')
    expect(wrapper.find('.field-display').exists()).toBe(false)
  })

  it('should render detail toolbar children and default slot scopes', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'DetailDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'title', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 2, title: 'Detail Row' }],
            },
          },
        },
      },
    })
    const detailView = ds.getView('Users', 'default')!
    detailView.selection.setCurrentRow(detailView.rows[0] ?? null)

    const wrapper = mountWithPageDataSet(RendererDetail, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
        toolbar: { type: 'r-toolbar', children: [{ type: 'detail-toolbar-action' }] },
      },
      slots: {
        default: ({ row }: Record<string, unknown>) => h('div', {
          class: 'biz-detail-template',
          'data-title': String(requireRecord(row, 'detail slot row')['title'] ?? ''),
        }, 'biz-detail-template'),
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="detail-toolbar-action"]').exists()).toBe(true)
    expect(wrapper.find('.biz-detail-template').attributes('data-title')).toBe('Detail Row')
  })

  it('should render structured detail toolbar prop', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'DetailZonePropDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'title', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 2, title: 'Detail Row' }],
            },
          },
        },
      },
    })
    const detailView = ds.getView('Users', 'default')!
    detailView.selection.setCurrentRow(detailView.rows[0] ?? null)

    const wrapper = mountWithPageDataSet(RendererDetail, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
        toolbar: { type: 'r-toolbar', children: [{ type: 'detail-toolbar-prop-action' }] },
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    expect(wrapper.find('.spark-action-stub[data-type="detail-toolbar-prop-action"]').exists()).toBe(true)
  })

  it('should expose form CRUD api aligned with tree/table containers', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'FormCrudDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const, isPrimaryKey: true },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
            },
          },
        },
      },
    })
    const view = ds.getView('Users', 'default')!
    view.selection.setCurrentRow(view.rows[0] ?? null)

    const wrapper = mountWithPageDataSet(RendererForm, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
      },
      global: {
        stubs: {
          'el-form': ElFormStub,
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    const api = getMountedComponentApi<{
      getCurrentRow(): Record<string, unknown> | null
      getFormData(): Record<string, unknown>
      setCurrentRowById(id: number | null): boolean
      appendRow(row: Record<string, unknown>): void
      updateRowById(id: number, patch: Record<string, unknown>): boolean
      deleteRowById(id: number): boolean
      addRow(row: Record<string, unknown>): Promise<unknown>
      editRowById(id: number, patch: Record<string, unknown>): Promise<unknown>
      removeRow(id: number): Promise<unknown>
    }>(wrapper, 'r-form')

    expect(api.getCurrentRow()?.['id']).toBe(1)
    expect(api.getFormData()['name']).toBe('Alice')

    expect(api.setCurrentRowById(2)).toBe(true)
    await nextTick()
    expect(api.getCurrentRow()?.['id']).toBe(2)

    api.appendRow({ id: 3, name: 'Carol' })
    await nextTick()
    expect(view.rows.map(row => row['id'])).toEqual([1, 2, 3])

    expect(api.updateRowById(3, { name: 'Caroline' })).toBe(true)
    await nextTick()
    expect(view.rows.find(row => row['id'] === 3)?.['name']).toBe('Caroline')

    expect(api.deleteRowById(1)).toBe(true)
    await nextTick()
    expect(view.rows.map(row => row['id'])).toEqual([2, 3])

    await api.addRow({ id: 4, name: 'Dave' })
    await nextTick()
    expect(view.rows.map(row => row['id'])).toEqual([2, 3, 4])

    await api.editRowById(4, { name: 'David' })
    await nextTick()
    expect(view.rows.find(row => row['id'] === 4)?.['name']).toBe('David')

    await api.removeRow(4)
    await nextTick()
    expect(view.rows.map(row => row['id'])).toEqual([2, 3])
  })

  it('should expose detail CRUD api aligned with tree/table containers', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'DetailCrudDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const, isPrimaryKey: true },
            { name: 'title', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 10, title: 'Alpha' }, { id: 11, title: 'Beta' }],
            },
          },
        },
      },
    })
    const view = ds.getView('Users', 'default')!
    view.selection.setCurrentRow(view.rows[0] ?? null)

    const wrapper = mountWithPageDataSet(RendererDetail, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
      },
      global: {
        stubs: {
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    const api = getMountedComponentApi<{
      getCurrentRow(): Record<string, unknown> | null
      getDetailData(): Record<string, unknown>
      setCurrentRowById(id: number | null): boolean
      appendRow(row: Record<string, unknown>): void
      updateRowById(id: number, patch: Record<string, unknown>): boolean
      deleteRowById(id: number): boolean
      addRow(row: Record<string, unknown>): Promise<unknown>
      editRowById(id: number, patch: Record<string, unknown>): Promise<unknown>
      removeRow(id: number): Promise<unknown>
    }>(wrapper, 'r-detail')

    expect(api.getCurrentRow()?.['id']).toBe(10)
    expect(api.getDetailData()['title']).toBe('Alpha')

    expect(api.setCurrentRowById(11)).toBe(true)
    await nextTick()
    expect(api.getCurrentRow()?.['id']).toBe(11)

    api.appendRow({ id: 12, title: 'Gamma' })
    await nextTick()
    expect(view.rows.map(row => row['id'])).toEqual([10, 11, 12])

    expect(api.updateRowById(12, { title: 'Gamma-2' })).toBe(true)
    await nextTick()
    expect(view.rows.find(row => row['id'] === 12)?.['title']).toBe('Gamma-2')

    expect(api.deleteRowById(10)).toBe(true)
    await nextTick()
    expect(view.rows.map(row => row['id'])).toEqual([11, 12])

    await api.addRow({ id: 13, title: 'Delta' })
    await nextTick()
    expect(view.rows.map(row => row['id'])).toEqual([11, 12, 13])

    await api.editRowById(13, { title: 'Delta-2' })
    await nextTick()
    expect(view.rows.find(row => row['id'] === 13)?.['title']).toBe('Delta-2')

    await api.removeRow(13)
    await nextTick()
    expect(view.rows.map(row => row['id'])).toEqual([11, 12])
  })

  it('should allow form CRUD business hooks to cancel default methods', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'FormCrudCancelDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' as const, isPrimaryKey: true },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{ id: 1, name: 'Alice' }],
            },
          },
        },
      },
    })

    const wrapper = mountWithPageDataSet(RendererForm, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
        onAddRow: async (_row: Record<string, unknown>, control: { cancel: boolean }) => { control.cancel = true },
        onEditRow: async (_id: number, _patch: Record<string, unknown>, control: { cancel: boolean }) => { control.cancel = true },
        onRemoveRow: async (_id: number, control: { cancel: boolean }) => { control.cancel = true },
      },
      global: {
        stubs: {
          'el-form': ElFormStub,
          SparkComponentRenderer: SparkActionStub,
        },
      },
    })

    const api = getMountedComponentApi<{
      addRow(row: Record<string, unknown>): Promise<Record<string, unknown>>
      editRowById(id: number, patch: Record<string, unknown>): Promise<Record<string, unknown>>
      removeRow(id: number): Promise<Record<string, unknown>>
    }>(wrapper, 'r-form')

    await expect(api.addRow({ id: 2, name: 'Bob' })).resolves.toMatchObject({ success: false })
    await expect(api.editRowById(1, { name: 'Alice-2' })).resolves.toMatchObject({ success: false })
    await expect(api.removeRow(1)).resolves.toMatchObject({ success: false })
  })

  it('r-form field should show correct value via DATA_ROW after initAutoSelection', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'FormFieldValueDS',
      scenarioId: 'SCENE',
      tables: {
        Users: {
          tableName: 'Users',
          modelBinding: { modelId: 'MODEL', modelName: 'Users' },
          columns: [
            { name: 'id', type: 'number' as const },
            { name: 'name', type: 'string' as const },
          ],
          views: {
            default: {
              rows: [{
                id: 1,
                name: '张三',
                lingma_sys_params: { r: [], e: ['name'], h: [], m: [], d: false },
              }],
            },
          },
        },
      },
    })
    // 不预设 currentRow，模拟运行时 initAutoSelection 后触发

    const wrapper = mountWithPageDataSet(RendererForm, {
      dataSet: ds,
      props: {
        dataViewKey: 'Users@default',
      },
      slots: {
        default: () => h(FieldText, {
          type: 'r-text',
          field: 'name',
          label: '姓名',
        }),
      },
      global: {
        stubs: {
          'el-form': ElFormStub,
          'el-form-item': ElFormItemStub,
          'el-input': ElInputStub,
        },
      },
    })

    // 尚无后端授权行时 fail-closed，不渲染字段。
    await nextTick()
    expect(wrapper.find('.el-input-stub').exists()).toBe(false)

    await loadFieldQuery(ds.getView('Users', 'default')!)
    // 触发 initAutoSelection（模拟运行时 PageRenderer 行为）
    ds.initAutoSelection()
    await nextTick()
    await nextTick()

    // 字段应显示第一行的值
    expect(wrapper.find('.el-input-stub').attributes('value')).toBe('张三')
  })
})
