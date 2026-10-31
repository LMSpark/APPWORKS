import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, reactive} from 'vue'
import ElementPlus, {ElCollapse} from 'element-plus'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererCard, RendererCollapseItem, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'

const cleanup: Array<() => void> = []
beforeAll(() => registerAllRenderers())
afterEach(() => {cleanup.splice(0).reverse().forEach(dispose => dispose())})

async function fixture(layout: 'card' | 'collapse') {
  const ds = SparkData.createDataSet({dataSetName: 'layout', scenarioId: 'T', tables: {
    Models: {tableName: 'Models', resourceType: 'static-data', columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'},
    ], views: {default: {rows: [{id: 'A', name: 'Alpha'}]}, other: {rows: [{id: 'C', name: 'Gamma'}]}}},
  }})
  const runtime = new PageRuntime({pageId: 'layout', scenarioIds: ['T'], loadScenario: async () => ds})
  await runtime.load(); cleanup.push(() => runtime.dispose())
  const view = ds.getView('Models', 'default')!, other = ds.getView('Models', 'other')!
  for (const item of [view, other]) {item.commitMode = 'staged'; item.setCurrentRowById(item.rows[0]!['id'] as string)}
  const request = vi.spyOn(view, 'requestData')
  const input = reactive({key: 'T@Models@default'})
  const children = [{type: 'r-text', props: {field: 'name', label: '名称'}}]
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'r-form'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => layout === 'card'
      ? h(RendererCard, {header: '基本信息', dataViewKey: input.key, children})
      : h(ElCollapse, {modelValue: ['main']}, () => h(RendererCollapseItem, {index: 0, name: 'main', dataViewKey: input.key, children}))
  }})
  const wrapper = mount(Host, {global: {plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkComponentRenderer: false, 'spark-component-renderer': false}}})
  cleanup.push(() => wrapper.unmount()); await flushPromises()
  return {wrapper, view, other, input, request}
}

describe('layout containers provide the standard DataView context', () => {
  it.each(['card', 'collapse'] as const)('%s binds children to the full view key, rebinds and keeps the old draft', async layout => {
    const {wrapper, view, other, input, request} = await fixture(layout)
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
    expect(request).not.toHaveBeenCalled()
  })
})
