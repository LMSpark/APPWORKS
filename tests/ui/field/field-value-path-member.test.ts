import {afterEach, describe, expect, it} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, type VNode} from 'vue'
import ElementPlus, {ElInput, ElInputNumber, ElSelect, ElSwitch} from 'element-plus'
import {SparkData, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {FieldNumber, FieldSelect, FieldSwitch, FieldText, Spark, PAGE_RUNTIME, RendererForm, useSparkComponent} from '@spark-appworks/spark-component'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = []
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); runtimes.splice(0).forEach(r => r.dispose())})

async function fixture(cfg: unknown, children: () => VNode[]) {
  const ds = SparkData.fromJson({scenarioId: 'S', dataSetName: 'S', tables: {Ent: {resourceType: 'static-data',
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'cfg', type: 'string'}],
    views: {default: {commitMode: 'staged', rows: [{id: 'a', cfg}]}}}}})
  const runtime = new PageRuntime({pageId: 'member-test', scenarioIds: ['S'], loadScenario: async () => ds})
  await runtime.load(); runtimes.push(runtime)
  const view: DataView = ds.getView('Ent')!
  view.setCurrentRowById('a')
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'member-test'}); sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(RendererForm, {dataViewKey: 'S@Ent@default', autoColumns: false, showDataViewMeta: false}, children)
  }}), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper); await flushPromises()
  return {wrapper, view}
}
const editedConfig = (view: DataView) => JSON.parse(String(view.getEditingRow('a')?.['cfg']))

describe('standard field valuePath members', () => {
  it('reads and writes text, number, switch and select members through the source field', async () => {
    const {wrapper, view} = await fixture('{"keep":true,"title":"t","limit":3,"on":false,"mode":"a"}', () => [
      h(FieldText, {field: 'cfg', valuePath: ['title']}),
      h(FieldNumber, {field: 'cfg', valuePath: ['limit']}),
      h(FieldSwitch, {field: 'cfg', valuePath: ['on']}),
      h(FieldSelect, {field: 'cfg', valuePath: ['mode'], options: [{label: 'A', value: 'a'}, {label: 'B', value: 'b'}]}),
    ])
    expect(wrapper.getComponent(ElInput).props('modelValue')).toBe('t')
    expect(wrapper.getComponent(ElInputNumber).props('modelValue')).toBe(3)
    expect(wrapper.getComponent(ElSwitch).props('modelValue')).toBe(false)
    wrapper.getComponent(ElInput).vm.$emit('update:modelValue', 'x'); await flushPromises()
    wrapper.getComponent(ElInputNumber).vm.$emit('update:modelValue', 7); await flushPromises()
    wrapper.getComponent(ElSwitch).vm.$emit('update:modelValue', true); await flushPromises()
    wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', 'b'); await flushPromises()
    expect(editedConfig(view)).toEqual({keep: true, title: 'x', limit: 7, on: true, mode: 'b'})
    view.discardEditingRows(['a']); await flushPromises()
    expect(wrapper.getComponent(ElInput).props('modelValue')).toBe('t')
    expect(view.hasEditingChanges()).toBe(false)
  })

  it('starts an empty source from an object and blocks editing of malformed sources', async () => {
    const empty = await fixture(null, () => [h(FieldText, {field: 'cfg', valuePath: ['title']})])
    empty.wrapper.getComponent(ElInput).vm.$emit('update:modelValue', 'n'); await flushPromises()
    expect(editedConfig(empty.view)).toEqual({title: 'n'})
    const bad = await fixture('{bad', () => [h(FieldText, {field: 'cfg', valuePath: ['title']})])
    expect(bad.wrapper.findComponent(ElInput).exists() ? bad.wrapper.getComponent(ElInput).props('disabled') : true).toBe(true)
    expect(bad.wrapper.text()).toContain('DATA_FIELD_MEMBER')
    expect(bad.view.hasEditingChanges()).toBe(false)
  })
})
