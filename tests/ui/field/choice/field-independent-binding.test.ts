import {describe, expect, it, vi} from 'vitest'
import {defineComponent, h, reactive} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {FieldSelect, FieldText, DATA_ROW, DATA_SOURCE, PAGE_RUNTIME, SPARK_REGISTRY_KEY, Spark, useSparkComponent} from '@spark-appworks/spark-component'
import {SUBTREE_FIELD_POLICY} from '../../../../packages/spark-component/src/permission'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '../../../../packages/spark-project-model/src/page/runtime-page'
import {PageTool} from '../../../../packages/spark-project-model/src/page/page-tool'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const Input = defineComponent({
  props: ['modelValue', 'disabled'], emits: ['update:modelValue'],
  setup(props, {slots}) {return () => h('div', {class: 'input', 'data-value': String(props.modelValue ?? ''),
    'data-disabled': String(props.disabled)}, slots['default']?.())},
})
const Option = defineComponent({props: ['value', 'label'], setup(props) {
  return () => h('span', {class: 'option', 'data-value': String(props.value)}, String(props.label))
}})
const FormItem = defineComponent({setup(_, {slots}) {return () => h('div', slots['default']?.())}})

async function fixture(access: Record<string, unknown> = {e: ['name', 'country', 'region']}) {
  const spaces = ['A', 'B'].map(scenarioId => SparkData.fromJson({scenarioId, dataSetName: scenarioId, tables: {
    internal: {modelBinding: {modelId: `${scenarioId}-model`, modelName: 'Input'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'},
        {name: 'country', type: 'string'}, {name: 'region', type: 'string'}],
      views: {default: {autoCurrentFirst: true, rows: [{id: 'one', name: scenarioId, country: scenarioId, region: 'north'}]}}},
    choices: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true},
      {name: 'country', type: 'string'}, {name: 'region', type: 'string'}],
      views: {default: {valueField: 'id', labelField: 'id', queryContext: {country: scenarioId, region: 'north'},
        rows: [{id: scenarioId, country: scenarioId, region: 'north'}, {id: `${scenarioId}2`, country: scenarioId, region: 'south'}], filterExpression: {logic: 'and', filters: [
        {field: 'country', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'country'}},
        {field: 'region', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'region'}},
      ]}}}},
  }, viewCascades: [{kind: 'field', cascadeId: 'name', tableName: 'internal', viewId: 'default', targetField: 'name',
    parents: ['country', 'region'].map(field => ({tableName: 'internal', viewId: 'default', field, parameter: field})),
    optionsView: {tableName: 'choices', viewId: 'default'}, valuePolicy: {mode: 'retain'}, valueFormat: 'native'}]}))
  for (const ds of spaces) {
    const view = ds.getView('internal', 'default')!
    const table = new DataSpaceQueryTable({scenarioId: ds.scenarioId!, metaName: 'Input'})
    view.bindQueryExecutor({executeQuery: async () => new DataSpaceQueryContext({identity: table.identity,
      scope: 'field', readScope: () => 'field', snapshot: table.applyResult({Result: {primaryKeyField: 'id', data: {Items: [
        {id: 'one', name: ds.scenarioId, country: ds.scenarioId, region: 'north', lingma_sys_params: access},
      ], Count: 1}}})})})
    await view.loadFromServer()
    ds.initAutoSelection()
  }
  const tool = new PageTool({pageId: 'fields'}); tool.hydrateFileText('rule.json', '[]'); tool.markLoaded()
  const runtime = new PageRuntime({tool, scenarioIds: ['A', 'B'], mainScenarioId: 'A',
    loadScenario: async id => spaces.find(ds => ds.scenarioId === id)!})
  await runtime.load()
  return {runtime, a: spaces[0]!.getView('internal', 'default')!, b: spaces[1]!.getView('internal', 'default')!}
}

function render(f: Awaited<ReturnType<typeof fixture>>, props: Record<string, unknown>, select = false) {
  const system = Spark.createSystem(), decoy = reactive({id: 'one', name: 'DECOY'})
  const Provider = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'r-form'}, {parentContext: system.rootContext})
    sparkProvide(PAGE_RUNTIME, f.runtime)
    sparkProvide(DATA_SOURCE, f.a)
    sparkProvide(DATA_ROW, decoy)
    sparkProvide(SUBTREE_FIELD_POLICY, 'unrestricted')
    return () => select ? h(FieldSelect, props) : h(FieldText, props)
  }})
  const wrapper = mount(Provider, {global: {provide: {[SPARK_REGISTRY_KEY]: system.registry},
    stubs: {'el-input': Input, 'el-select': Input, 'el-option': Option, 'el-form-item': FormItem,
      'el-tabs': Input, 'el-tab-pane': Option}}})
  return {wrapper, decoy}
}

describe('standard fields bind their own DataView', () => {
  it.each([true, false])('tab choices write only the bound field with its permission (allowed=%s)', async allowed => {
    const f = await fixture({e: allowed ? ['region'] : []})
    const {wrapper, decoy} = render(f, {dataViewKey: 'B@Input@default', field: 'region', presentation: 'tabs',
      options: [{value: 'north', label: '北区'}, {value: 'south', label: '南区'}]}, true)
    try {
      await flushPromises()
      expect(wrapper.find('el-select').exists()).toBe(false)
      expect(wrapper.findComponent(FieldSelect).getComponent(Input).attributes('class')).toContain('field-select-tabs')
      const tabs = wrapper.findComponent(Input)
      expect(tabs.props('modelValue')).toBe('north')
      tabs.vm.$emit('update:modelValue', 'south'); await flushPromises()
      expect(f.b.getEditingPatch('one')).toEqual(allowed ? {region: 'south'} : undefined)
      expect(f.a.hasEditingChanges()).toBe(false); expect(decoy.name).toBe('DECOY')
    } finally {wrapper.unmount(); f.runtime.dispose()}
  })

  it.each([false, true])('writes optional label storage only through its own field permission (allowed=%s)', async allowed => {
    const f = await fixture({e: allowed ? ['name', 'region'] : ['name']})
    const {wrapper} = render(f, {dataViewKey: 'B@Input@default', dataField: 'name', textStorageField: 'region'}, true)
    try {
      await flushPromises()
      wrapper.findComponent(Input).vm.$emit('update:modelValue', 'B'); await flushPromises()
      expect(f.b.getEditingPatch('one')).toEqual(allowed ? {region: 'B'} : undefined)
      expect(f.b.currentRow?.['region']).toBe('north')
    } finally {wrapper.unmount(); f.runtime.dispose()}
  })

  it('does not write optional label storage after a cancelled event', async () => {
    const f = await fixture()
    const {wrapper} = render(f, {dataViewKey: 'B@Input@default', dataField: 'name', textStorageField: 'region',
      onChange: (_next: unknown, _previous: unknown, control: {cancel: boolean}) => {control.cancel = true}}, true)
    try {
      await flushPromises()
      wrapper.findComponent(Input).vm.$emit('update:modelValue', 'B'); await flushPromises()
      expect(f.b.hasEditingChanges()).toBe(false)
    } finally {wrapper.unmount(); f.runtime.dispose()}
  })

  it('consumes the explicit view permission instead of inherited unrestricted input policy', async () => {
    const f = await fixture({e: []}), {wrapper, decoy} = render(f, {dataViewKey: 'B@Input@default', dataField: 'name'})
    try {
      expect(wrapper.get('.input').attributes('data-value')).toBe('B')
      expect(wrapper.get('.input').attributes('data-disabled')).toBe('true')
      wrapper.findComponent(Input).vm.$emit('update:modelValue', 'denied'); await flushPromises()
      expect(f.b.hasEditingChanges()).toBe(false)
      expect(wrapper.findComponent(FieldText).emitted('update:modelValue')).toBeUndefined()
      expect(decoy.name).toBe('DECOY')
    } finally {wrapper.unmount(); f.runtime.dispose()}
  })

  it.each(['h', 'm'])('protects explicit values when the original query marks the field %s', async permission => {
    const f = await fixture({e: [], [permission]: ['name']})
    const {wrapper} = render(f, {dataViewKey: 'B@Input@default', dataField: 'name', modelValue: 'SECRET'})
    try {
      expect(wrapper.html()).not.toContain('SECRET')
      if (permission === 'h') expect(wrapper.find('.input').exists()).toBe(false)
      else expect(wrapper.get('.input').attributes('data-disabled')).toBe('true')
    } finally {wrapper.unmount(); f.runtime.dispose()}
  })

  it('resolves full model identity and writes the same view editing overlay, then releases old bindings', async () => {
    const f = await fixture(), props = reactive({dataViewKey: 'B@Input@default', dataMember: 'currentRow', dataField: 'name'})
    const off = vi.spyOn(f.b.events, 'off')
    const {wrapper, decoy} = render(f, props)
    try {
      expect(wrapper.get('.input').attributes('data-value')).toBe('B')
      wrapper.findComponent(Input).vm.$emit('update:modelValue', 'B edited')
      await flushPromises()
      expect(f.b.getEditingPatch('one')).toEqual({name: 'B edited'})
      expect(f.b.rows[0]?.['name']).toBe('B')
      expect(f.a.hasEditingChanges()).toBe(false)
      expect(decoy.name).toBe('DECOY')
      f.b.discardEditingRows(); await flushPromises()
      expect(wrapper.get('.input').attributes('data-value')).toBe('B')
      props.dataViewKey = 'A@Input@default'; await flushPromises()
      expect(off).toHaveBeenCalled()
      expect(wrapper.get('.input').attributes('data-value')).toBe('A')
      f.b.updateEditingValue('one', 'name', 'old view')
      await flushPromises()
      expect(wrapper.get('.input').attributes('data-value')).toBe('A')
    } finally {wrapper.unmount(); f.runtime.dispose()}
  })

  it('takes cascade options from the explicit value view and both parent values across binding switches', async () => {
    const f = await fixture(), props = reactive({dataViewKey: 'B@Input@default', dataMember: 'value', dataField: 'name'})
    const {wrapper} = render(f, props, true)
    try {
      await flushPromises()
      expect(wrapper.findAll('.option').map(node => node.text())).toEqual(['B'])
      f.b.updateEditingValue('one', 'region', 'south'); await flushPromises()
      expect(wrapper.findAll('.option').map(node => node.text())).toEqual(['B2'])
      wrapper.findComponent(Input).vm.$emit('update:modelValue', 'B2'); await flushPromises()
      expect(f.b.getEditingPatch('one')).toEqual({region: 'south', name: 'B2'})
      props.dataViewKey = 'A@Input@default'; await flushPromises()
      expect(wrapper.findAll('.option').map(node => node.text())).toEqual(['A'])
      f.b.updateEditingValue('one', 'country', 'missing'); await flushPromises()
      expect(wrapper.findAll('.option').map(node => node.text())).toEqual(['A'])
    } finally {wrapper.unmount(); f.runtime.dispose()}
  })

  it('does not fall back to the parent for an unknown explicit view', async () => {
    const f = await fixture()
    try {expect(() => render(f, {dataViewKey: 'B@Input@missing', dataField: 'name'})).toThrow(/DATA_VIEW_MISSING/)}
    finally {f.runtime.dispose()}
  })

  it('reads a non-field member without writing a coincidentally named current-row field', async () => {
    const f = await fixture(), {wrapper} = render(f, {dataViewKey: 'B@Input@default', dataMember: 'total'})
    try {
      expect(wrapper.get('.input').attributes('data-value')).toBe(String(f.b.total))
      expect(wrapper.get('.input').attributes('data-disabled')).toBe('true')
      wrapper.findComponent(Input).vm.$emit('update:modelValue', '22'); await flushPromises()
      expect(f.b.hasEditingChanges()).toBe(false)
    } finally {wrapper.unmount(); f.runtime.dispose()}
  })

  it('does not write a pending change into a newly bound view', async () => {
    const f = await fixture()
    let release!: () => void
    const pending = new Promise<void>(resolve => {release = resolve})
    const props = reactive({dataViewKey: 'B@Input@default', dataField: 'name', onChange: () => pending})
    const {wrapper} = render(f, props)
    try {
      wrapper.findComponent(Input).vm.$emit('update:modelValue', 'stale')
      props.dataViewKey = 'A@Input@default'; await flushPromises()
      release(); await flushPromises()
      expect(f.a.hasEditingChanges()).toBe(false)
      expect(f.b.hasEditingChanges()).toBe(false)
      expect(wrapper.findComponent(FieldText).emitted('update:modelValue')).toBeUndefined()
    } finally {release(); wrapper.unmount(); f.runtime.dispose()}
  })
})
