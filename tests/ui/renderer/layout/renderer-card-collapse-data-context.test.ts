import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, reactive} from 'vue'
import ElementPlus from 'element-plus'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererCard, RendererCollapseItem, RendererSteps, Spark, SparkComponentRenderer, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'

const cleanup: Array<() => void> = []
beforeAll(() => registerAllRenderers())
afterEach(() => {cleanup.splice(0).reverse().forEach(dispose => dispose())})

async function fixture(layout: 'card' | 'collapse' | 'steps', includeExplicitCollapseItem = false) {
  const ds = SparkData.createDataSet({dataSetName: 'layout', scenarioId: 'T', tables: {
    Models: {tableName: 'Models', resourceType: 'static-data', columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'},
    ], views: {default: {rows: [{id: 'A', name: 'Alpha'}]}, other: {rows: [{id: 'C', name: 'Gamma'}]}}},
  }})
  const runtime = new PageRuntime({pageId: 'layout', scenarioIds: ['T'], loadScenario: async () => ds})
  await runtime.load(); cleanup.push(() => runtime.dispose())
  const view = ds.getView('Models', 'default')!, other = ds.getView('Models', 'other')!
  for (const item of [view, other]) {item.commitMode = 'staged'; item.setCurrentRowById(item.rows[0]!['id'] as string)}
  const requestDefault = vi.spyOn(view, 'requestData')
  const requestOther = vi.spyOn(other, 'requestData')
  const input = reactive({key: 'T@Models@default', step: 'one'})
  const children = [{type: 'r-text', props: {field: 'name', label: '名称'}}]
  const collapseItems = [
    {type: 'r-collapse-item', props: {name: 'main'}, children},
    ...(includeExplicitCollapseItem
      ? [{type: 'r-collapse-item', props: {name: 'override', dataViewKey: 'T@Models@other'}, children}]
      : []),
  ]
  const steps = [
    {type: 'r-step', props: {name: 'one', title: '第一步'}, children},
    {type: 'r-step', props: {name: 'two', title: '第二步', dataViewKey: 'T@Models@other'}, children: [{type: 'r-text', props: {field: 'name', label: '名称'}}]},
  ]
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'r-form'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => layout === 'card'
      ? h(RendererCard, {header: '基本信息', dataViewKey: input.key, children})
      : layout === 'collapse'
        ? h(SparkComponentRenderer, {config: {
          type: 'r-collapse',
          props: {modelValue: includeExplicitCollapseItem ? ['main', 'override'] : ['main'], dataViewKey: input.key},
          children: collapseItems,
        }})
        : h(RendererSteps, {dataViewKey: input.key, modelValue: input.step, children: steps})
  }})
  const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false, 'spark-component-renderer': false}}})
  cleanup.push(() => wrapper.unmount()); await flushPromises()
  return {wrapper, view, other, input, requestDefault, requestOther}
}

describe('layout containers provide the standard DataView context', () => {
  it.each(['card', 'collapse', 'steps'] as const)('%s binds children to the full view key, rebinds and keeps the old draft', async layout => {
    const {wrapper, view, other, input, requestDefault, requestOther} = await fixture(layout)
    if (layout === 'collapse') expect(wrapper.findComponent(RendererCollapseItem).exists()).toBe(true)
    expect(wrapper.get('input').element.value).toBe('Alpha')
    await wrapper.get('input').setValue('draft A'); await flushPromises()
    expect(view.getEditingPatch('A')).toEqual({name: 'draft A'})
    const off = vi.spyOn(view.events, 'off')
    input.key = 'T@Models@other'; await flushPromises()
    expect(off).toHaveBeenCalled()
    expect(wrapper.get('input').element.value).toBe('Gamma')
    await wrapper.get('input').setValue('draft C'); await flushPromises()
    expect(other.getEditingPatch('C')).toEqual({name: 'draft C'})
    expect(view.getEditingPatch('A')).toEqual({name: 'draft A'})
    expect(requestDefault).not.toHaveBeenCalled()
    expect(requestOther).not.toHaveBeenCalled()
  })

  it('a step dataViewKey replaces only that step', async () => {
    const {wrapper, view, other, input, requestDefault, requestOther} = await fixture('steps')
    await wrapper.get('input').setValue('draft A')
    await flushPromises()
    input.step = 'two'
    await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Gamma')
    await wrapper.get('input').setValue('draft C')
    await flushPromises()
    input.step = 'one'
    await flushPromises()
    expect(wrapper.get('input').element.value).toBe('draft A')
    expect(view.getEditingPatch('A')).toEqual({name: 'draft A'})
    expect(other.getEditingPatch('C')).toEqual({name: 'draft C'})
    expect(requestDefault).not.toHaveBeenCalled()
    expect(requestOther).not.toHaveBeenCalled()
  })

  it('an item dataViewKey overrides the parent context', async () => {
    const {wrapper, view, other, requestDefault, requestOther} = await fixture('collapse', true)
    const inputs = wrapper.findAll('input')
    expect(inputs.map(input => input.element.value)).toEqual(['Alpha', 'Gamma'])
    expect(wrapper.findComponent(RendererCollapseItem).exists()).toBe(true)
    await inputs[0]!.setValue('draft A')
    await inputs[1]!.setValue('draft C')
    await flushPromises()
    expect(view.getEditingPatch('A')).toEqual({name: 'draft A'})
    expect(other.getEditingPatch('C')).toEqual({name: 'draft C'})
    expect(requestDefault).not.toHaveBeenCalled()
    expect(requestOther).not.toHaveBeenCalled()
  })
})
