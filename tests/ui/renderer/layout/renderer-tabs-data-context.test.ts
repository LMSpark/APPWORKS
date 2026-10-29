import {afterEach, describe, expect, it, vi} from 'vitest'
import {DOMWrapper, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, reactive} from 'vue'
import ElementPlus, {ElDialog} from 'element-plus'
import {SparkData, type DataMember} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DATA_ROW, DATA_SOURCE, PAGE_RUNTIME, FieldText, RendererTabs, RendererTabPane, RendererDialog, RendererSection, useSparkComponent, useSparkConsume} from '@spark-appworks/spark-component'

const cleanup: Array<() => void> = []
afterEach(() => {cleanup.splice(0).reverse().forEach(dispose => dispose())})

async function fixture(options: {inherit?: boolean; pane?: boolean; member?: `${DataMember}`; dialog?: boolean; append?: boolean; section?: boolean; lazy?: boolean; useCard?: boolean} = {}) {
  const ds = SparkData.createDataSet({dataSetName: 'tabs', scenarioId: 'T', tables: {
    Models: {tableName: 'Models', resourceType: 'static-data', columns: [
      {name: 'id', type: 'string', isPrimaryKey: true}, {name: 'name', type: 'string'},
    ], views: {default: {rows: [{id: 'A', name: 'Alpha'}, {id: 'B', name: 'Beta'}]}, other: {rows: [{id: 'C', name: 'Gamma'}]}}},
  }})
  const runtime = new PageRuntime({pageId: 'tabs', scenarioIds: ['T'], loadScenario: async () => ds})
  await runtime.load(); cleanup.push(() => runtime.dispose())
  const view = ds.getView('Models', 'default')!, other = ds.getView('Models', 'other')!
  for (const item of [view, other]) {item.commitMode = 'staged'; item.setCurrentRowById(item.rows[0]!['id'] as string)}
  const request = vi.spyOn(view, 'requestData')
  const input = reactive({key: 'T@Models@default', member: options.member, paneKey: 'T@Models@other'})
  const Probe = defineComponent({setup() {
    const {sparkConsume} = useSparkConsume(), row = sparkConsume(DATA_ROW), source = sparkConsume(DATA_SOURCE)
    return () => h('output', `${source?.viewId ?? 'none'}:${String(row?.['id'] ?? 'none')}`)
  }})
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'r-form'})
    sparkProvide(PAGE_RUNTIME, runtime)
    if (options.inherit) {sparkProvide(DATA_SOURCE, view); sparkProvide(DATA_ROW, view.rows[1]!)}
    if (options.section) return () => h(RendererSection, {title: '请求设置', gridColumns: 1, dataViewKey: input.key,
      ...(options.lazy ? {lazy: true, collapsible: true, defaultCollapsed: true} : {}), useCard: options.useCard === true,
      ...(input.member ? {dataMember: input.member} : {})}, {
      default: () => [h(Probe), h(FieldText, {field: 'name', label: '名称'})],
    })
    if (options.dialog) return () => h(RendererDialog, {modelValue: true, dataViewKey: input.key, appendToBody: options.append === true,
      destroyOnClose: options.append === true, bodyClass: 'test-bound-dialog'}, {
      default: () => [h(Probe), h(FieldText, {field: 'name', label: '名称'})],
    })
    return () => h(RendererTabs, {modelValue: 'main', ...(options.inherit ? {} : {dataViewKey: input.key}), dataMember: input.member}, {
      default: () => h(RendererTabPane, {index: 0, name: 'main', label: '配置', ...(options.pane ? {dataViewKey: input.paneKey} : {})}, {
        default: () => [h(Probe), h(FieldText, {field: 'name', label: '名称'})],
      }),
    })
  }})
  const wrapper = mount(Host, {global: {plugins: [ElementPlus], stubs: {teleport: !options.append, ...(options.append ? {'el-dialog': ElDialog} : {})}}})
  cleanup.push(() => wrapper.unmount()); await flushPromises()
  return {wrapper, view, other, input, request}
}

describe('standard tabs DataView context', () => {
  it('preserves the same view binding when a nested dialog is mounted outside its parent DOM', async () => {
    const {wrapper, view, other, input, request} = await fixture({dialog: true, append: true})
    const body = new DOMWrapper(document.body)
    expect(wrapper.element.contains(body.get('.test-bound-dialog').element)).toBe(false)
    expect(body.get<HTMLInputElement>('.test-bound-dialog input').element.value).toBe('Alpha')
    await body.get('.test-bound-dialog input').setValue('outside parent'); await flushPromises()
    expect(view.getEditingPatch('A')).toEqual({name: 'outside parent'})
    input.key = 'T@Models@other'; await flushPromises()
    expect(body.get<HTMLInputElement>('.test-bound-dialog input').element.value).toBe('Gamma')
    await body.get('.test-bound-dialog input').setValue('other view'); await flushPromises()
    expect(other.getEditingPatch('C')).toEqual({name: 'other view'})
    expect(request).not.toHaveBeenCalled()
    wrapper.unmount(); await flushPromises()
    expect(body.find('.test-bound-dialog').exists()).toBe(false)
  })
  it('binds a section to its original view and rebinds without losing the previous draft', async () => {
    const {wrapper, view, other, input, request} = await fixture({section: true})
    expect(wrapper.get('input').element.value).toBe('Alpha')
    await wrapper.get('input').setValue('section A'); await flushPromises()
    view.setCurrentRowById('B'); await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Beta')
    input.key = 'T@Models@other'; await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Gamma')
    await wrapper.get('input').setValue('section C'); await flushPromises()
    expect(other.getEditingRow('C')?.['name']).toBe('section C')
    expect(view.getEditingRow('A')?.['name']).toBe('section A')
    expect(request).not.toHaveBeenCalled()
    expect(wrapper.getComponent(RendererSection).attributes('dataviewkey')).toBeUndefined()
  })
  it.each([false, true])('lazily opens a section, preserves collapsed edits and rebinds to the current view (card=%s)', async useCard => {
    const {wrapper, view, other, input, request} = await fixture({section: true, lazy: true, useCard})
    expect(wrapper.findComponent(FieldText).exists()).toBe(false)
    expect(wrapper.find('output').exists()).toBe(false)
    input.key = 'T@Models@other'; await flushPromises()
    expect(wrapper.findComponent(FieldText).exists()).toBe(false)
    const toggle = () => wrapper.get('.renderer-section-toggle').trigger('click')
    await toggle(); await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Gamma')
    const field = wrapper.get('input').element
    await wrapper.get('input').setValue('retained draft'); await flushPromises()
    await toggle(); await flushPromises()
    expect(wrapper.get('input').element).toBe(field)
    expect(other.getEditingPatch('C')).toEqual({name: 'retained draft'})
    other.discardEditingRows(); await flushPromises()
    await toggle(); await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Gamma')
    await wrapper.get('input').setValue('other draft'); await flushPromises()
    input.key = 'T@Models@default'; await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Alpha')
    expect(other.getEditingPatch('C')).toEqual({name: 'other draft'})
    expect(view.hasEditingChanges()).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })
  it('does not use the section current row when bound to a collection', async () => {
    const {wrapper} = await fixture({section: true, member: 'rows'})
    expect(wrapper.get('output').text()).toBe('default:none')
  })
  it('provides the original view through a dialog and rebinds its content without losing the old draft', async () => {
    const {wrapper, view, other, input, request} = await fixture({dialog: true})
    expect(wrapper.get('input').element.value).toBe('Alpha')
    await wrapper.get('input').setValue('dialog A'); await flushPromises()
    expect(view.getEditingRow('A')?.['name']).toBe('dialog A')
    input.key = 'T@Models@other'; await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Gamma')
    await wrapper.get('input').setValue('dialog C'); await flushPromises()
    expect(other.getEditingRow('C')?.['name']).toBe('dialog C')
    expect(view.getEditingRow('A')?.['name']).toBe('dialog A')
    expect(request).not.toHaveBeenCalled()
  })
  it('reads and edits the original view and follows pointer changes without querying', async () => {
    const {wrapper, view, request} = await fixture()
    expect(wrapper.get('input').element.value).toBe('Alpha')
    await wrapper.get('input').setValue('edited Alpha'); await flushPromises()
    expect(view.getEditingRow('A')?.['name']).toBe('edited Alpha')
    view.setCurrentRowById('B'); await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Beta')
    expect(wrapper.get('output').text()).toBe('default:B')
    expect(request).not.toHaveBeenCalled()
  })

  it('rebinds descendants to a new named view and preserves the old draft', async () => {
    const {wrapper, view, other, input} = await fixture()
    await wrapper.get('input').setValue('draft A'); await flushPromises()
    input.key = 'T@Models@other'; await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Gamma')
    await wrapper.get('input').setValue('draft C'); await flushPromises()
    expect(other.getEditingRow('C')?.['name']).toBe('draft C')
    expect(view.getEditingRow('A')?.['name']).toBe('draft A')
    view.setCurrentRowById('B'); await flushPromises()
    expect(wrapper.get('output').text()).toBe('other:C')
  })

  it('preserves a repeated parent row when no binding overrides it', async () => {
    const {wrapper, view} = await fixture({inherit: true})
    expect(wrapper.get('input').element.value).toBe('Beta')
    await wrapper.get('input').setValue('draft B'); await flushPromises()
    expect(view.getEditingRow('B')?.['name']).toBe('draft B')
    expect(view.getEditingRow('A')?.['name']).toBe('Alpha')
  })

  it('lets a pane explicitly override the parent view', async () => {
    const {wrapper, input} = await fixture({pane: true})
    expect(wrapper.get('input').element.value).toBe('Gamma')
    input.paneKey = 'T@Models@default'; await flushPromises()
    expect(wrapper.get('input').element.value).toBe('Alpha')
  })

  it.each(['rows', 'selectedRows', 'value'] as const)('respects the %s member without exposing a row context', async member => {
    const {wrapper} = await fixture({member})
    expect(wrapper.get('output').text()).toBe('default:none')
    const fieldValue = wrapper.find('input').exists() ? wrapper.get('input').element.value : wrapper.text()
    // Value + field is the formal selected input mapping; the other collection members must not use currentRow.
    if (member === 'value') expect(fieldValue).toBe('Alpha')
    else expect(fieldValue).not.toContain('Alpha')
  })
})
