import {afterEach, describe, expect, it} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {FieldCodeEditor, PAGE_RUNTIME, RendererForm, Spark, useSparkComponent} from '@spark-appworks/spark-component'

const wrappers: VueWrapper[] = []
const runtimes: PageRuntime[] = []
const CodeEditorStub = defineComponent({
  props: {modelValue: {type: String, default: ''}, readOnly: Boolean, language: {type: String, default: 'javascript'}},
  emits: ['update:modelValue'],
  setup: (props, {emit}) => () => h('textarea', {
    'data-testid': 'code-editor', value: props.modelValue, readonly: props.readOnly,
    onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
  }),
})

afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
})

async function editor(options: {readonly?: boolean} = {}) {
  const dataSet = SparkData.fromJson({scenarioId: 'CODE', dataSetName: 'Tool files', tables: {
    Files: {resourceType: 'static-data', columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'text', type: 'string'},
    ], views: {default: {commitMode: 'staged', rows: [{id: 'script.js', text: 'const before = true'}]}}},
  }})
  const runtime = new PageRuntime({pageId: 'code-editor-binding', scenarioIds: ['CODE'], loadScenario: async () => dataSet})
  await runtime.load(); runtimes.push(runtime)
  const view = dataSet.getView('Files')!
  view.setCurrentRowById('script.js')
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'code-editor-binding-test'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(RendererForm, {dataViewKey: 'CODE@Files@default', autoColumns: false, showDataViewMeta: false}, () => h(FieldCodeEditor, {
        dataViewKey: 'CODE@Files@default', dataMember: 'currentRow', dataField: 'text',
        language: 'javascript', ...(options.readonly === undefined ? {} : {readonly: options.readonly}),
      }))
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {
    plugins: [ElementPlus, Spark.createPlugin()], stubs: {SparkCodeEditor: CodeEditorStub},
  }})
  wrappers.push(wrapper)
  await flushPromises()
  return {wrapper, view}
}

describe('FieldCodeEditor standard DataView binding', () => {
  it('reads the bound field and writes edits into that DataView edit state', async () => {
    const {wrapper, view} = await editor()
    const input = wrapper.get('[data-testid="code-editor"]')
    expect((input.element as HTMLTextAreaElement).value).toBe('const before = true')

    await input.setValue('const after = true')
    await flushPromises()

    expect(view.getEditingRow('script.js')?.['text']).toBe('const after = true')
    expect(view.rows[0]?.['text']).toBe('const before = true')
  })

  it('keeps a readonly field from creating a DataView edit', async () => {
    const {wrapper, view} = await editor({readonly: true})
    const input = wrapper.get('[data-testid="code-editor"]')
    expect((input.element as HTMLTextAreaElement).readOnly).toBe(true)

    await input.setValue('const forbidden = true')
    await flushPromises()

    expect(view.hasEditingChanges()).toBe(false)
  })
})
