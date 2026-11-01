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
async function fixture(key = 'O@Choices@default') {
  registerAllRenderers()
  const owner = SparkData.fromJson({scenarioId: 'S', dataSetName: 'Owner', tables: {
    Inputs: {resourceType: 'static-data', columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'json', type: 'string'}],
      views: {default: {commitMode: 'staged', rows: [{id: 'a', json: '{"field":"old","keep":false}'}]}}},
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
  const schema = ref<JsonSchemaObject>({type: 'object', properties: {field: {type: 'string', title: '业务字段',
    enum: ['static-fallback'], 'x-optionDataViewKey': key}}})
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
})
