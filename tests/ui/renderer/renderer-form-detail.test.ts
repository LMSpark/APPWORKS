import { afterEach, describe, it, expect } from 'vitest'
import { config, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { defineComponent, h, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { RendererToolbar, RendererForm, RendererDetail, FieldText, FieldTextarea, FieldNumber, FieldSwitch, FieldDate, FieldContextRenderer, Spark, PAGE_RUNTIME, DATA_SOURCE, useSparkComponent } from '@spark-appworks/spark-component'
import RendererFieldScope from '../../../packages/spark-component/src/components/containers/support/scope/RendererFieldScope.vue'
import RendererHostScope from '../../../packages/spark-component/src/components/containers/support/scope/RendererHostScope.vue'
import { SparkData, getSparkNodeChildren, nodeInputProps, isSparkNode } from '@spark-appworks/spark-data'
import type { DataView, SparkNode } from '@spark-appworks/spark-data'
import { PageRuntime } from '@spark-appworks/spark-project-model'
import { DataSpaceQueryTable } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import NodeBasicInfo from '../../../src/views/app/dev-system/components/NodeBasicInfo.vue'
import { getMountedComponentApi, mountWithPageDataSet } from '../../support/helpers/mount-with-page-dataset'
import { requireRecord, requireString } from '../../support/helpers/runtime-guards'

async function loadFieldQuery(view: DataView, metaName = 'Users'): Promise<void> {
  const table = new DataSpaceQueryTable({ scenarioId: view.dataSet?.scenarioId ?? 'SCENE', metaName })
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
    return () => {
      if (readConfigType(props.config) === 'r-toolbar') {
        if (!isSparkNode(props.config)) throw new TypeError('Invalid toolbar node')
        const node = props.config
        return h(RendererToolbar, {...nodeInputProps(node), children: getSparkNodeChildren(node['children'])})
      }
      return h('button', {class: 'spark-action-stub', 'data-type': readConfigType(props.config)}, readConfigType(props.config))
    }
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

const originalStubs = config.global.stubs
afterEach(() => { config.global.stubs = originalStubs })

it.each(['form', 'scope', 'inline-scope'] as const)('prevents native navigation in %s while retaining explicit submit listeners and keyboard events', async kind => {
  const received: Event[] = []
  const onSubmit = (event: Event) => received.push(event)
  const wrapper = kind === 'form'
    ? mount(RendererForm, {props: {autoColumns: false, showDataViewMeta: false, formProps: {onSubmit}},
      slots: {default: () => h('textarea', {value: 'draft'})}, global: {plugins: [ElementPlus, Spark.createPlugin()]}})
    : mount(RendererFieldScope, {props: {model: {value: 'draft'}, inline: kind === 'inline-scope'},
      attrs: {onSubmit}, global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  try {
    const form = wrapper.get('form')
    const enter = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})
    ;(kind === 'form' ? wrapper.get('textarea') : form).element.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(false)
    const submit = new Event('submit', {bubbles: true, cancelable: true})
    form.element.dispatchEvent(submit)
    expect(submit.defaultPrevented).toBe(true)
    expect(received).toEqual([submit])
    if (kind === 'form') expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('draft')
  } finally {wrapper.unmount()}
})

it.each(['form', 'detail'] as const)('keeps %s slot scope on the bound DataView editing row and restores it on discard', async kind => {
  const ds = SparkData.createDataSet({scenarioId: 'SCENE', dataSetName: 'EditingScope', tables: {Inputs: {tableName: 'Inputs', resourceType: 'static-data',
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'mode', type: 'string'}],
    views: {default: {commitMode: 'staged', autoCurrentFirst: false, rows: [{id: 'a', mode: 'Table'}, {id: 'b', mode: 'Join'}]}}}}})
  const view = ds.getView('Inputs')!
  view.setCurrentRowById('a')
  view.updateEditingValue('a', 'mode', 'SelfRefData')
  const runtime = new PageRuntime({pageId: 'editing-scope', scenarioIds: ['SCENE'], loadScenario: async () => ds})
  await runtime.load()
  const wrapper = mount(defineComponent({setup() {
    useSparkComponent({type: 'editing-scope-host'}).sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(kind === 'form' ? RendererForm : RendererDetail, {dataViewKey: 'SCENE@Inputs@default', autoColumns: false}, {
      default: ({row}: {row: unknown}) => h('span', {'data-slot-mode': ''}, String(requireRecord(row, 'slot row')['mode'])),
    })
  }}), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  try {
    expect(wrapper.get('[data-slot-mode]').text()).toBe('SelfRefData')
    view.updateEditingValue('a', 'mode', 'Navigation'); await flushPromises()
    expect(wrapper.get('[data-slot-mode]').text()).toBe('Navigation')
    expect(view.rows[0]?.['mode']).toBe('Table')
    view.discardEditingRows(); await flushPromises()
    expect(wrapper.get('[data-slot-mode]').text()).toBe('Table')
    view.setCurrentRowById('b'); await flushPromises()
    view.updateEditingValue('a', 'mode', 'HierarchyData'); await flushPromises()
    expect(wrapper.get('[data-slot-mode]').text()).toBe('Join')
    view.updateEditingValue('b', 'mode', 'Navigation'); await flushPromises()
    expect(wrapper.get('[data-slot-mode]').text()).toBe('Navigation')
  } finally {wrapper.unmount(); runtime.dispose()}
})

it.each(['host', 'field'] as const)('%s scope preserves the DataView row identity for an explicitly bound field', async kind => {
  const ds = SparkData.createDataSet({scenarioId: 'SCENE', dataSetName: 'ScopedRows', tables: {Inputs: {
    tableName: 'Inputs', modelBinding: {modelId: 'MODEL', modelName: 'Inputs'}, resourceType: 'static-data',
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'}],
    views: {default: {autoCurrentFirst: false, rows: [
      {id: 'current', name: 'current row', lingma_sys_params: {r: [], e: ['name'], h: [], m: [], d: false}},
      {id: 'scoped', name: 'scoped row', lingma_sys_params: {r: [], e: ['name'], h: [], m: [], d: false}},
    ]}},
  }}})
  const view = ds.getView('Inputs', 'default')!
  await loadFieldQuery(view, 'Inputs')
  view.setCurrentRowById('current')
  const scopedRow = view.rows.find(row => row['id'] === 'scoped')!
  const runtime = new PageRuntime({pageId: `scope-row-${kind}`, scenarioIds: ['SCENE'], loadScenario: async () => ds})
  await runtime.load()
  const registry = Spark.createRegistry()
  registry.register({type: 'r-text', component: FieldText})
  const children: SparkNode[] = [{type: 'r-text', props: {dataViewKey: 'SCENE@Inputs@default', dataField: 'name'}}]
  const stubs = {...config.global.stubs}
  delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
  config.global.stubs = stubs
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'scope-row-test-host'})
    sparkProvide(PAGE_RUNTIME, runtime)
    sparkProvide(DATA_SOURCE, view)
    return () => kind === 'host'
      ? h(RendererHostScope, {row: scopedRow, children})
      : h(RendererFieldScope, {model: scopedRow, inline: true, children})
  }}), {global: {plugins: [ElementPlus, Spark.createPlugin({registry})]}})
  try {
    expect(wrapper.get('.field-value').text()).toBe('scoped row')
  } finally {wrapper.unmount(); runtime.dispose()}
})

async function automaticFieldsFixture(kind: 'form' | 'detail', children?: SparkNode[], autoColumns = true) {
  const liveChildren = shallowRef(children)
  const stubs = {...config.global.stubs}
  delete stubs['SparkComponentRenderer']; delete stubs['spark-component-renderer']
  config.global.stubs = stubs
  const ds = SparkData.createDataSet({scenarioId: 'SCENE', dataSetName: 'AutoFields', tables: {Users: {
    tableName: 'Users', modelBinding: {modelId: 'MODEL', modelName: 'Users'},
    columns: [{name: 'id', type: 'string', isPrimaryKey: true, label: '编号'},
      {name: 'name', type: 'string', label: '姓名'}, {name: 'amount', type: 'number', label: '数量'},
      {name: 'active', type: 'boolean', label: '启用'}, {name: 'date', type: 'date', label: '日期'},
      {name: 'secret', type: 'string', label: '隐藏字段'}, {name: 'masked', type: 'string', label: '脱敏字段'},
      {name: 'custom', type: 'object', label: '复合字段'}],
    views: {default: {rows: [
      {id: 'A', name: '张三', amount: 3, active: true, date: '2026-10-10', custom: {x: 1}, secret: '禁止泄露隐藏', masked: '禁止泄露脱敏',
        lingma_sys_params: {r: [], e: ['name', 'amount', 'active', 'date', 'custom'], h: ['secret'], m: ['masked'], d: false}},
      {id: 'B', name: '李四', amount: 4, active: false, date: '2026-10-11', custom: {x: 2}, secret: '禁止泄露隐藏', masked: '禁止泄露脱敏',
        lingma_sys_params: {r: [], e: [], h: ['secret'], m: ['masked'], d: false}},
    ]}},
  }}})
  const view = ds.getView('Users', 'default')!
  await loadFieldQuery(view); view.setCurrentRowById('A')
  const registry = Spark.createRegistry()
  registry.register({type: 'r-text', component: FieldText})
  registry.register({type: 'r-number', component: FieldNumber})
  registry.register({type: 'r-switch', component: FieldSwitch})
  registry.register({type: 'r-date', component: FieldDate})
  registry.register({type: 'r-column-group', component: FieldContextRenderer})
  const runtime = new PageRuntime({pageId: 'auto-fields', scenarioIds: ['SCENE'], loadScenario: async () => ds})
  await runtime.load()
  const Host = defineComponent({setup() {
    useSparkComponent({type: 'auto-fields-host'}).sparkProvide(PAGE_RUNTIME, runtime)
    onBeforeUnmount(() => runtime.dispose())
    return () => {
      const props = {dataViewKey: 'SCENE@Users@default', autoColumns, showDataViewMeta: false,
        ...(liveChildren.value ? {children: liveChildren.value} : {})}
      return kind === 'form' ? h(RendererForm, props) : h(RendererDetail, props)
    }
  }})
  const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin({registry})]}})
  await flushPromises()
  return {wrapper, view, ds, liveChildren}
}

describe('automatic field children use the parent container', () => {
  it.each(['form', 'detail'] as const)('reacts to configured field titles and readonly changes in %s', async kind => {
    const {wrapper, view, ds, liveChildren} = await automaticFieldsFixture(kind,
      [{type: 'r-text', props: {field: 'name', label: '原标题', readonly: true}}])
    try {
      expect(wrapper.text()).toContain('原标题')
      liveChildren.value = [{type: 'r-text', props: {field: 'name', label: '修改后标题', readonly: false}}]
      await flushPromises()
      expect(wrapper.text()).toContain('修改后标题')
      expect(wrapper.text()).not.toContain('原标题')
      if (kind === 'form') {
        const input = wrapper.getComponent(FieldText).get('input')
        expect(input.attributes('disabled')).toBeUndefined()
        await input.setValue('新输入'); await flushPromises()
        expect(view.getEditingRow('A')?.['name']).toBe('新输入')
      }
    } finally {wrapper.unmount(); ds.destroy()}
  })
  it.each(['form', 'detail'] as const)('renders visible fields with the real %s parent and follows the DataView pointer', async kind => {
    const {wrapper, view, ds} = await automaticFieldsFixture(kind)
    try {
      expect(wrapper.text()).toContain('姓名')
      expect(wrapper.text()).not.toContain('隐藏字段')
      expect(wrapper.html()).not.toContain('禁止泄露')
      if (kind === 'form') {
        const name = wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'name')!
        expect(name.get('input').element.value).toBe('张三')
        await name.get('input').setValue('张三修改'); await flushPromises()
        expect(view.getEditingRow('A')?.['name']).toBe('张三修改')
        const amount = wrapper.getComponent(FieldNumber)
        await amount.get('input').setValue('8'); await amount.get('input').trigger('change'); await flushPromises()
        expect(view.getEditingRow('A')?.['amount']).toBe(8)
        expect(amount.getComponent({name: 'ElInputNumber'}).props('modelValue')).toBe(8)
        view.updateEditingValue('A', 'amount', 9); await flushPromises()
        expect(amount.get('input').element.value).toBe('9')
        await wrapper.getComponent(FieldSwitch).get('[role="switch"]').trigger('click'); await flushPromises()
        expect(view.getEditingRow('A')?.['active']).toBe(false)
        expect(wrapper.getComponent(FieldDate).get('input').element.value).toContain('2026')
        expect(wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'custom')?.get('input').attributes('disabled')).toBeDefined()
        const custom = wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'custom')!
        await custom.get('input').setValue('不得覆盖原对象'); await flushPromises()
        expect(view.getEditingRow('A')?.['custom']).toEqual({x: 1})
        view.discardEditingRows()
      } else {
        expect(wrapper.text()).toContain('张三')
        expect(wrapper.text()).toContain('••••')
        expect(wrapper.find('input').exists()).toBe(false)
        expect(view.hasEditingChanges()).toBe(false)
      }
      view.setCurrentRowById('B'); await flushPromises()
      if (kind === 'form') {
        const name = wrapper.findAllComponents(FieldText).find(field => field.props('field') === 'name')!
        expect(name.get('input').element.value).toBe('李四')
        expect(name.get('input').attributes('disabled')).toBeDefined()
      } else expect(wrapper.text()).toContain('李四')
      view.setCurrentRowById(null); await flushPromises()
      expect(wrapper.find('input').exists()).toBe(false)
      expect(wrapper.find('.field-value').exists()).toBe(false)
    } finally {wrapper.unmount(); ds.destroy()}
  })

  it.each(['form', 'detail'] as const)('keeps explicit children and the automatic generation switch in %s', async kind => {
    const explicit = await automaticFieldsFixture(kind, [{type: 'r-text', props: {field: 'name', label: '自定义名称'}}])
    try {
      expect(explicit.wrapper.text()).toContain('自定义名称')
      expect(explicit.wrapper.findAllComponents(FieldText)).toHaveLength(1)
      expect(explicit.wrapper.text()).not.toContain('数量')
    } finally {explicit.wrapper.unmount(); explicit.ds.destroy()}
    const disabled = await automaticFieldsFixture(kind, undefined, false)
    try {
      expect(disabled.wrapper.findAllComponents(FieldText)).toHaveLength(0)
      expect(disabled.wrapper.find('.field-display').exists()).toBe(false)
    } finally {disabled.wrapper.unmount(); disabled.ds.destroy()}
  })

  it('honors an explicit readonly child even when the query permits editing', async () => {
    const {wrapper, view, ds} = await automaticFieldsFixture('form', [{type: 'r-text', props: {field: 'name', label: '只读姓名', readonly: true}}])
    try {
      const field = wrapper.getComponent(FieldText)
      expect(field.get('input').attributes('disabled')).toBeDefined()
      field.findComponent({name: 'ElInput'}).vm.$emit('update:modelValue', '不得写入')
      await flushPromises()
      expect(view.hasEditingChanges()).toBe(false)
      expect(view.currentRow?.['name']).toBe('张三')
    } finally {wrapper.unmount(); ds.destroy()}
  })
})

describe('RendererForm and RendererDetail toolbar integration', () => {
  it('renders blueprint capability name and description as complete-key standard field bindings', async () => {
    const ds = SparkData.createDataSet({scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, dataSetName: 'BlueprintCapability', tables: {Base_NavigationInfo: {
      tableName: 'Base_NavigationInfo', modelBinding: {modelId: 'MODEL', modelName: 'Base_NavigationInfo'}, columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'}, {name: 'memo', type: 'string'}],
      views: {default: {rows: [{id: 'node-1', name: '能力', memo: '描述', lingma_sys_params: {r: [], e: ['name', 'memo'], h: [], m: [], d: false}}]}},
    }}})
    const view = ds.getView('Base_NavigationInfo', 'default')!
    await loadFieldQuery(view, 'Base_NavigationInfo')
    view.setCurrentRowById('node-1')
    const runtime = new PageRuntime({pageId: 'blueprint-capability-fields', scenarioIds: [LOWCODE_APPLICATION_CATALOG_FORM_KEY], loadScenario: async () => ds})
    await runtime.load()
    const state = {projectId: 'project-1', selectedNode: ref(undefined), blueprintPageRuntime: ref(runtime),
      blueprintDraft: {nodeId: 'node-1', kind: 'page', capability: {name: '能力', description: '描述'}},
      blueprintNodeFieldAccess: () => ({read: true, write: true}), markBlueprintDirty: () => undefined}
    const Host = defineComponent({setup() {useSparkComponent({type: 'blueprint-capability-host'}).sparkProvide(PAGE_RUNTIME, runtime)
      return () => h(NodeBasicInfo, {state: state as never, sections: ['capability']})}})
    const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {'el-form': ElFormStub, 'el-form-item': ElFormItemStub, 'el-input': ElInputStub}}})
    try {
      expect(wrapper.findComponent(RendererForm).props('dataViewKey')).toBe(`${LOWCODE_APPLICATION_CATALOG_FORM_KEY}@Base_NavigationInfo@default`)
      expect(wrapper.findAllComponents(FieldText).some(field => field.props('dataField') === 'name')).toBe(true)
      expect(wrapper.findAllComponents(FieldTextarea).some(field => field.props('dataField') === 'memo')).toBe(true)
      expect(wrapper.findAll('.el-input-stub').map(input => input.attributes('value'))).toContain('能力')
      expect(wrapper.findAll('.el-input-stub').map(input => input.attributes('value'))).toContain('描述')
    } finally {wrapper.unmount(); runtime.dispose(); ds.destroy()}
  })

  it('binds capability text fields to the selected DataView row and honors its write permission', async () => {
    const ds = SparkData.createDataSet({scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY, dataSetName: 'CapabilityForm', tables: {Base_NavigationInfo: {
      tableName: 'Base_NavigationInfo', modelBinding: {modelId: 'MODEL', modelName: 'Base_NavigationInfo'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'}, {name: 'memo', type: 'string'}],
      views: {default: {rows: [{id: 'node-1', name: '能力', memo: '描述', lingma_sys_params: {r: [], e: ['name'], h: [], m: [], d: false}}]}},
    }}})
    const view = ds.getView('Base_NavigationInfo', 'default')!
    await loadFieldQuery(view, 'Base_NavigationInfo'); view.setCurrentRowById('node-1')
    const runtime = new PageRuntime({pageId: 'capability-fields', scenarioIds: [LOWCODE_APPLICATION_CATALOG_FORM_KEY], loadScenario: async () => ds})
    await runtime.load()
    const Host = defineComponent({setup() {useSparkComponent({type: 'capability-fields-host'}).sparkProvide(PAGE_RUNTIME, runtime)
      return () => h(RendererForm, {dataViewKey: `${LOWCODE_APPLICATION_CATALOG_FORM_KEY}@Base_NavigationInfo@default`, autoColumns: false, showDataViewMeta: false}, {
        default: () => [h(FieldText, {dataViewKey: `${LOWCODE_APPLICATION_CATALOG_FORM_KEY}@Base_NavigationInfo@default`, dataMember: 'currentRow', dataField: 'name', label: '能力名称'}),
          h(FieldTextarea, {dataViewKey: `${LOWCODE_APPLICATION_CATALOG_FORM_KEY}@Base_NavigationInfo@default`, dataMember: 'currentRow', dataField: 'memo', label: '功能描述'})],
      })}})
    const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {'el-form': ElFormStub, 'el-form-item': ElFormItemStub, 'el-input': ElInputStub}}})
    try {
      const textField = wrapper.getComponent(FieldText)
      const memoField = wrapper.getComponent(FieldTextarea)
      expect(textField.getComponent(ElInputStub).props('modelValue')).toBe('能力')
      expect(memoField.getComponent(ElInputStub).props('modelValue')).toBe('描述')
      expect(textField.getComponent(ElInputStub).props('disabled')).toBe(false)
      expect(memoField.getComponent(ElInputStub).props('disabled')).toBe(true)
      textField.getComponent(ElInputStub).vm.$emit('update:modelValue', '新能力')
      memoField.getComponent(ElInputStub).vm.$emit('update:modelValue', '越权描述')
      await flushPromises()
      expect(view.getEditingRow('node-1')?.['name']).toBe('新能力')
      expect(view.getEditingRow('node-1')?.['memo']).toBe('描述')
    } finally {wrapper.unmount(); runtime.dispose(); ds.destroy()}
  })

  it.each(['dataSource', 'dataViewKey'])('tracks pointer changes and row permissions through %s', async (binding) => {
    const ds = SparkData.createDataSet({dataSetName: 'PointerDS', scenarioId: 'SCENE', tables: {Users: {
      tableName: 'Users', modelBinding: {modelId: 'MODEL', modelName: 'Users'},
      columns: [{name: 'id', type: 'number', isPrimaryKey: true}, {name: 'name', type: 'string'}],
      views: {default: {rows: [
        {id: 1, name: 'Alice', lingma_sys_params: {r: [], e: ['name'], h: [], m: [], d: false}},
        {id: 2, name: 'Bob', lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}},
      ]}},
    }}})
    const view = ds.getView('Users', 'default')!
    await loadFieldQuery(view); view.setCurrentRowById(1)
    const wrapper = mountWithPageDataSet(RendererForm, {
      dataSet: ds,
      props: {autoColumns: false, ...(binding === 'dataSource' ? {dataSource: view} : {dataViewKey: 'Users@default'})},
      slots: {default: () => h(FieldText, {field: 'name', label: '姓名'})},
      global: {stubs: {'el-form': ElFormStub, 'el-form-item': ElFormItemStub, 'el-input': ElInputStub}},
    })
    expect(wrapper.getComponent(ElInputStub).props('modelValue')).toBe('Alice')
    view.setCurrentRowById(2); await nextTick(); await nextTick()
    expect(wrapper.getComponent(ElInputStub).props('modelValue')).toBe('Bob')
    expect(wrapper.getComponent(ElInputStub).props('disabled')).toBe(true)
    wrapper.getComponent(ElInputStub).vm.$emit('update:modelValue', '禁止越权'); await nextTick()
    expect(view.hasEditingChanges()).toBe(false)
    view.setCurrentRowById(1); await nextTick(); await nextTick()
    expect(wrapper.getComponent(ElInputStub).props('disabled')).toBe(false)
    wrapper.getComponent(ElInputStub).vm.$emit('update:modelValue', 'Alice edited'); await nextTick()
    expect(view.getEditingRow(1)?.['name']).toBe('Alice edited')
    expect(view.getEditingRow(2)?.['name']).toBe('Bob')
    view.discardEditingRows()
    view.replaceRows(view.rows.map(row => ({...row, name: `${row['name']} replaced`})))
    await nextTick(); await nextTick()
    const api = getMountedComponentApi<{getFormData(): Record<string, unknown>}>(wrapper, 'r-form')
    expect(api.getFormData()['name']).toBe('Alice replaced')
    view.setCurrentRowById(null); await nextTick(); await nextTick()
    expect(wrapper.findComponent(ElInputStub).exists()).toBe(false)
    ds.destroy()
  })

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
