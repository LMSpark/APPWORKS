import {afterEach, describe, expect, it} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus, {ElSelect} from 'element-plus'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import type {JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {PAGE_RUNTIME, RendererForm, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], original = {...config.global.stubs}
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); runtimes.splice(0).forEach(r => r.dispose()); config.global.stubs = original})
async function fixture(key = 'O@Choices@default', field: unknown = 'old', multiple = false) {
  registerAllRenderers()
  const owner = SparkData.fromJson({scenarioId: 'S', dataSetName: 'Owner', tables: {
    Inputs: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'json', type: 'string'}],
      views: {default: {commitMode: 'staged', rows: [{id: 'a', json: JSON.stringify({field, keep: false})}]}}},
    Choices: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'title', type: 'string'}],
      views: {default: {valueField: 'id', labelField: 'title', rows: [{id: 'old', title: '错误空间候选'}]}}},
  }})
  const options = SparkData.fromJson({scenarioId: 'O', dataSetName: 'Options', tables: {
    Choices: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'code', type: 'string'}, {name: 'title', type: 'string'}],
      views: {default: {valueField: 'code', labelField: 'title', rows: [{id: '1', code: 'old', title: '原业务字段'}, {id: '2', code: 'new', title: '新业务字段'}]},
        other: {valueField: 'code', labelField: 'title', rows: [{id: '3', code: 'third', title: '第三字段'}]}}},
  }})
  const runtime = new PageRuntime({pageId: 'json-options', scenarioIds: ['S', 'O'], loadScenario: async id => id === 'S' ? owner : options})
  await runtime.load(); runtimes.push(runtime)
  const view = owner.getView('Inputs')!, choices = options.getView('Choices')!, readonly = ref(false)
  view.setCurrentRowById('a')
  const schema = ref<JsonSchemaObject>({type: 'object', properties: {field: {type: multiple ? 'array' : 'string', title: '业务字段',
    ...(multiple ? {items: {type: 'string'}} : {enum: ['static-fallback']}), 'x-optionDataViewKey': key}}})
  const stubs = {...original}
  for (const name of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'json-options-test'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(RendererForm, {dataViewKey: 'S@Inputs@default', children: [{type: 'r-json', props: {
      field: 'json', mode: 'form', schema: schema.value, readonly: readonly.value,
    }}]})
  }}), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper); await flushPromises()
  return {wrapper, view, choices, readonly, schema}
}

describe('JSON member DataView option bindings', () => {
  it('resolves the full option-space identity, writes only the original JSON member and cancels through its view', async () => {
    const f = await fixture(), select = f.wrapper.getComponent(ElSelect)
    expect(select.text()).toContain('原业务字段')
    expect(select.text()).not.toContain('错误空间候选')
    select.vm.$emit('update:modelValue', 'new'); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: 'new', keep: false})
    expect(f.view.rows[0]!['json']).toBe('{"field":"old","keep":false}')
    expect(f.choices.hasEditingChanges()).toBe(false)
    f.view.discardEditingRows(['a']); await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).text()).toContain('原业务字段')
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('updates labels from the same option view without replacing an unknown stored value', async () => {
    const f = await fixture()
    f.choices.replaceRows([{id: '1', code: 'old', title: '实时字段'}]); await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).text()).toContain('实时字段')
    f.choices.replaceRows([]); await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).text()).toContain('old')
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('keeps readonly JSON unchanged even when a control emits a new candidate', async () => {
    const f = await fixture()
    f.readonly.value = true; await flushPromises()
    const select = f.wrapper.getComponent(ElSelect)
    expect(select.props('disabled')).toBe(true)
    select.vm.$emit('update:modelValue', 'new'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it.each(['MISSING@Choices@default', 'Choices@default', ''])('reports invalid binding %s without using static enum candidates', async key => {
    const f = await fixture(key)
    expect(f.wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(f.wrapper.findComponent(ElSelect).exists()).toBe(false)
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('releases old option controls when the schema binding switches', async () => {
    const f = await fixture(), old = f.wrapper.getComponent(ElSelect)
    f.schema.value = {type: 'object', properties: {field: {type: 'string', 'x-optionDataViewKey': 'O@Choices@other'}}}
    await flushPromises()
    old.vm.$emit('update:modelValue', 'new'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    const current = f.wrapper.getComponent(ElSelect)
    current.vm.$emit('update:modelValue', 'third'); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: 'third', keep: false})
  })

  it('does not accept a late choice after the option view is destroyed', async () => {
    const f = await fixture(), select = f.wrapper.getComponent(ElSelect)
    f.choices.destroy()
    select.vm.$emit('update:modelValue', 'new'); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })
  it('edits a native string array through the option view and cancels only the original JSON field', async () => {
    const f = await fixture('O@Choices@default', ['old', 'missing'], true), select = f.wrapper.getComponent(ElSelect)
    expect(select.props('multiple')).toBe(true)
    expect(f.wrapper.text()).toContain('missing')
    expect(f.view.hasEditingChanges()).toBe(false)
    select.vm.$emit('update:modelValue', ['old', 'missing', 'new']); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: ['old', 'missing', 'new'], keep: false})
    expect(f.choices.hasEditingChanges()).toBe(false)
    f.view.discardEditingRows(['a']); await flushPromises()
    expect(f.wrapper.getComponent(ElSelect).props('modelValue')).toEqual(['old', 'missing'])
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('rejects unoffered values, duplicate values and wrong native item types without losing an existing array', async () => {
    const f = await fixture('O@Choices@default', ['old'], true)
    for (const value of [['old', 'not-offered'], ['new', 'new'], [0], 'new', [{field: 'new'}]]) {
      f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', value); await flushPromises()
      expect(f.view.hasEditingChanges()).toBe(false)
    }
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', []); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: [], keep: false})
  })

  it('keeps array edits under the original readonly and released-view guards', async () => {
    const f = await fixture('O@Choices@default', ['old'], true)
    f.readonly.value = true; await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', ['new']); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
    f.readonly.value = false; await flushPromises()
    f.choices.destroy()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', ['new']); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('preserves native zero and boolean values from the bound option view without string coercion', async () => {
    const f = await fixture('O@Choices@default', [], true)
    f.schema.value = {type: 'object', properties: {field: {type: 'array', items: {}, 'x-optionDataViewKey': 'O@Choices@default'}}}
    f.choices.replaceRows([{id: 'zero', code: 0, title: '零'}, {id: 'false', code: false, title: '否'}]); await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', [0, false]); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: [0, false], keep: false})
    expect(f.choices.hasEditingChanges()).toBe(false)
  })

  it('enforces array item type even when an incorrectly typed candidate is offered', async () => {
    const f = await fixture('O@Choices@default', ['old'], true)
    f.choices.replaceRows([{id: 'zero', code: 0, title: '零'}]); await flushPromises()
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', [0]); await flushPromises()
    expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('retains an existing unmatched item while applying the item type only to newly chosen values', async () => {
    const f = await fixture('O@Choices@default', [7], true)
    f.wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', [7, 'new']); await flushPromises()
    expect(JSON.parse(String(f.view.getEditingRow('a')?.['json']))).toEqual({field: [7, 'new'], keep: false})
  })

  it.each([{value:[{field: 'old'}]}, {value:[null]}])('keeps complex array $value in the JSON editor instead of replacing it through a scalar picker', async ({value:field}) => {
    const f = await fixture('O@Choices@default', field, true)
    expect(f.wrapper.findComponent(ElSelect).exists()).toBe(false)
    expect(f.wrapper.find('textarea').exists()).toBe(true)
    expect(f.view.hasEditingChanges()).toBe(false)
  })

})
