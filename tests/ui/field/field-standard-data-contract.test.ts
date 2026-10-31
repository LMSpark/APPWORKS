import {afterEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, reactive} from 'vue'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DisplayPagination, FieldCheckTag, FieldEntityPicker, FieldMention, FieldUserPicker, PAGE_RUNTIME, useSparkComponent} from '@spark-appworks/spark-component'

const cleanup: Array<() => void> = []
afterEach(() => {cleanup.splice(0).reverse().forEach(dispose => dispose())})

const FormItem = defineComponent({setup(_, {slots}) {return () => h('div', slots['default']?.())}})
const CheckTag = defineComponent({props: ['checked', 'disabled'], emits: ['change'],
  setup(props, {slots}) {return () => h('span', {class: 'check-tag', 'data-checked': String(props.checked), 'data-disabled': String(props.disabled)}, slots['default']?.())}})
const Mention = defineComponent({props: ['modelValue', 'disabled'], emits: ['update:model-value', 'select', 'search'],
  setup(props) {return () => h('div', {class: 'mention', 'data-value': String(props.modelValue ?? ''), 'data-disabled': String(props.disabled)})}})
const Pagination = defineComponent({props: ['total', 'pageSize', 'currentPage'], emits: ['update:current-page', 'update:page-size'],
  setup(props) {return () => h('div', {class: 'pagination', 'data-total': String(props.total), 'data-page': String(props.currentPage), 'data-size': String(props.pageSize)})}})

async function fixture(child: (props: Record<string, unknown>) => ReturnType<typeof h>, initial: Record<string, unknown>) {
  const ds = SparkData.createDataSet({dataSetName: 'contract', scenarioId: 'T', tables: {
    Models: {tableName: 'Models', resourceType: 'static-data', columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'},
      {name: 'active', type: 'boolean'}, {name: 'ownerId', type: 'string'},
    ], views: {
      default: {pageSize: 1, rows: [{id: 'A', name: 'Alpha', active: false, ownerId: ''}, {id: 'B', name: 'Beta', active: true, ownerId: ''}]},
      other: {pageSize: 5, rows: [{id: 'C', name: 'Gamma', active: true, ownerId: ''}]},
    }},
  }})
  const runtime = new PageRuntime({pageId: 'contract', scenarioIds: ['T'], loadScenario: async () => ds})
  await runtime.load(); cleanup.push(() => runtime.dispose())
  const view = ds.getView('Models', 'default')!, other = ds.getView('Models', 'other')!
  for (const item of [view, other]) {item.commitMode = 'staged'; item.setCurrentRowById(item.rows[0]!['id'] as string)}
  const input = reactive({...initial})
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'r-form'})
    sparkProvide(PAGE_RUNTIME, runtime)
    return () => child({...input})
  }})
  const wrapper = mount(Host, {global: {stubs: {'el-form-item': FormItem, 'el-check-tag': CheckTag, 'el-mention': Mention, 'el-pagination': Pagination}}})
  cleanup.push(() => wrapper.unmount()); await flushPromises()
  return {wrapper, view, other, input}
}

describe('standard data contract of field and display components', () => {
  it('FieldCheckTag reads and writes its bound field through the full view key, rebinds and releases', async () => {
    const {wrapper, view, other, input} = await fixture(props => h(FieldCheckTag, props), {dataViewKey: 'T@Models@default', dataField: 'active', label: '启用'})
    const off = vi.spyOn(view.events, 'off')
    expect(wrapper.get('.check-tag').attributes('data-checked')).toBe('false')
    expect(wrapper.get('.check-tag').text()).toBe('启用')
    wrapper.findComponent(CheckTag).vm.$emit('change', true); await flushPromises()
    expect(view.getEditingPatch('A')).toEqual({active: true})
    expect(wrapper.get('.check-tag').attributes('data-checked')).toBe('true')
    input['dataViewKey'] = 'T@Models@other'; await flushPromises()
    expect(off).toHaveBeenCalled()
    expect(wrapper.get('.check-tag').attributes('data-checked')).toBe('true')
    wrapper.findComponent(CheckTag).vm.$emit('change', false); await flushPromises()
    expect(other.getEditingPatch('C')).toEqual({active: false})
    expect(view.getEditingPatch('A')).toEqual({active: true})
  })

  it('FieldMention writes text and the writeback field into the bound view editing overlay instead of the row', async () => {
    const triggers = [{prefix: '@', split: ' ', writebackField: 'ownerId'}]
    const {wrapper, view, other, input} = await fixture(props => h(FieldMention, {...props, mentionTriggers: triggers,
      options: [{value: 'Alice', label: 'Alice', persistedValue: 'U1'}]}), {dataViewKey: 'T@Models@default', dataField: 'name'})
    expect(wrapper.get('.mention').attributes('data-value')).toBe('Alpha')
    const mention = () => wrapper.findComponent(Mention)
    mention().vm.$emit('update:model-value', 'Hi @Alice '); await flushPromises()
    mention().vm.$emit('select', {value: 'Alice', label: 'Alice', persistedValue: 'U1'}, '@'); await flushPromises()
    expect(view.getEditingPatch('A')).toEqual({name: 'Hi @Alice ', ownerId: 'U1'})
    expect(view.rows[0]).toMatchObject({name: 'Alpha', ownerId: ''})
    input['dataViewKey'] = 'T@Models@other'; await flushPromises()
    expect(wrapper.get('.mention').attributes('data-value')).toBe('Gamma')
    mention().vm.$emit('update:model-value', 'Gamma 2'); await flushPromises()
    expect(other.getEditingPatch('C')).toEqual({name: 'Gamma 2'})
    expect(view.getEditingPatch('A')).toEqual({name: 'Hi @Alice ', ownerId: 'U1'})
  })

  it('picker presets forward the standard binding props to the entity picker', async () => {
    const {wrapper, input} = await fixture(props => h(FieldUserPicker, props),
      {dataViewKey: 'T@Models@default', dataMember: 'currentRow', dataField: 'ownerId'})
    expect(wrapper.getComponent(FieldEntityPicker).props()).toMatchObject({dataViewKey: 'T@Models@default', dataMember: 'currentRow', dataField: 'ownerId'})
    input['dataViewKey'] = 'T@Models@other'; await flushPromises()
    expect(wrapper.getComponent(FieldEntityPicker).props('dataViewKey')).toBe('T@Models@other')
  })

  it('DisplayPagination consumes the bound view paging state and pages through the view, then rebinds', async () => {
    const {wrapper, view, other, input} = await fixture(props => h(DisplayPagination, props), {dataViewKey: 'T@Models@default'})
    const setPage = vi.spyOn(view, 'setPage').mockResolvedValue(undefined)
    const setPageSize = vi.spyOn(other, 'setPageSize').mockResolvedValue(undefined)
    const pagination = () => wrapper.get('.pagination')
    expect([pagination().attributes('data-total'), pagination().attributes('data-size')]).toEqual([String(view.total), '1'])
    wrapper.findComponent(Pagination).vm.$emit('update:current-page', 2); await flushPromises()
    expect(setPage).toHaveBeenCalledWith(2)
    input['dataViewKey'] = 'T@Models@other'; await flushPromises()
    expect([pagination().attributes('data-total'), pagination().attributes('data-size')]).toEqual([String(other.total), '5'])
    wrapper.findComponent(Pagination).vm.$emit('update:page-size', 10); await flushPromises()
    expect(setPageSize).toHaveBeenCalledWith(10)
    expect(setPage).toHaveBeenCalledOnce()
  })

  it('DisplayPagination fails fast on an unknown explicit view instead of falling back', async () => {
    await expect(fixture(props => h(DisplayPagination, props), {dataViewKey: 'T@Models@missing'})).rejects.toThrow(/DATA_VIEW_MISSING/)
  })
})
