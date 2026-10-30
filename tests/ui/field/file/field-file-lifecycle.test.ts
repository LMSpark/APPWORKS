import {afterEach, describe, expect, it, vi} from 'vitest'
import {defineComponent, h, reactive, type Component} from 'vue'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory, createRouter} from 'vue-router'
import ElementPlus from 'element-plus'
import {SparkData} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {FieldFileBrowser, FieldFilePath, FieldImage, FieldUpload, PageUploadError, PAGE_RUNTIME, PAGE_SERVICE,
  RendererForm, Spark, useSparkComponent, type PageUploadedFile} from '@spark-appworks/spark-component'
import {buildPageService} from '../../../../packages/spark-component/src/page/services/buildPageService'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

const components: Array<{name: string; component: Component; browse: boolean}> = [
  {name: 'upload', component: FieldUpload, browse: false},
  {name: 'file path', component: FieldFilePath, browse: false},
  {name: 'image', component: FieldImage, browse: false},
  {name: 'file browser', component: FieldFileBrowser, browse: true},
]
const disposals: Array<() => void> = []
afterEach(() => {disposals.splice(0).reverse().forEach(dispose => dispose())})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no})
  return {promise, resolve, reject}
}

function uploaded(): PageUploadedFile {
  return {name: 'proof.docx', file: new File(['proof'], 'proof.docx'), size: 5, type: '', lastModified: 1,
    response: {url: '/uploads/proof.docx'}, url: '/uploads/proof.docx'}
}

async function fixture(component: Component, onChange?: (...args: unknown[]) => void | Promise<void>) {
  let scope = 'file-field'
  const spaces = ['A', 'B'].map(scenarioId => SparkData.fromJson({scenarioId, tables: {Files: {
    modelBinding: {modelId: `${scenarioId}-files`, modelName: 'Files'},
    columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'path', type: 'string'}, {name: 'alternate', type: 'string'}],
    views: {default: {autoLoad: false, commitMode: 'staged'}},
  }}}))
  for (const dataSet of spaces) {
    const view = dataSet.getView('Files')!
    const table = new DataSpaceQueryTable({scenarioId: dataSet.scenarioId!, metaName: 'Files'})
    view.bindQueryExecutor({executeQuery: async () => new DataSpaceQueryContext({identity: table.identity,
      scope: 'file-field', readScope: () => scope, snapshot: table.applyResult({Result: {primaryKeyField: 'id', data: {
        Items: ['one', 'two'].map(id => ({id, path: `/${dataSet.scenarioId}/${id}`, alternate: 'original',
          lingma_sys_params: {e: ['path', 'alternate']}})), Count: 2,
      }}})})})
    await view.refresh()
    view.setCurrentRowById('one')
  }
  const runtime = new PageRuntime({pageId: 'file-fields', scenarioIds: ['A', 'B'],
    loadScenario: async id => spaces.find(space => space.scenarioId === id)!})
  await runtime.load()
  disposals.push(() => runtime.dispose())
  const pending = deferred<PageUploadedFile[]>(), transfer = vi.fn(() => pending.promise), showMessage = vi.fn()
  const service = buildPageService(createRouter({history: createMemoryHistory(), routes: []}), {
    pageService: {uploadFiles: transfer, browseFiles: transfer},
    messageService: {
      error: message => showMessage(message, 'error'), info: message => showMessage(message, 'info'),
      success: message => showMessage(message, 'success'), warning: message => showMessage(message, 'warning'),
    },
  })
  const props = reactive({dataViewKey: 'A@Files@default', dataMember: 'currentRow', dataField: 'path', action: '/upload', readonly: false})
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'file-field-lifecycle-host'})
    sparkProvide(PAGE_RUNTIME, runtime)
    sparkProvide(PAGE_SERVICE, service)
    return () => h(RendererForm, {dataViewKey: props.dataViewKey, contextDataMember: 'currentRow',
      autoColumns: false, showDataViewMeta: false}, {default: () => h(component, {...props, ...(onChange ? {onChange} : {})})})
  }}), {global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  disposals.push(() => {if (wrapper.exists()) wrapper.unmount()})
  await flushPromises()
  return {wrapper, props, pending, transfer, showMessage, invalidateQuery: () => {scope = 'expired'},
    a: spaces[0]!.getView('Files')!, b: spaces[1]!.getView('Files')!}
}

async function start(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('.primary-action-button, .browse-action-button').trigger('click')
}

describe('standard file field DataView lifecycle', () => {
  it.each(components)('$name writes only the bound editing overlay and supports cancel', async ({component, browse}) => {
    const f = await fixture(component)
    await start(f.wrapper)
    expect(f.transfer).toHaveBeenCalledTimes(1)
    expect(f.a.hasEditingChanges()).toBe(false)
    f.pending.resolve([uploaded()]); await flushPromises()
    expect(f.a.getEditingRow('one')?.['path']).toBe(browse ? 'proof.docx' : '/uploads/proof.docx')
    expect(f.a.rows[0]?.['path']).toBe('/A/one')
    expect(f.b.hasEditingChanges()).toBe(false)
    f.a.discardPendingChanges(['one']); await flushPromises()
    expect(f.a.getEditingRow('one')?.['path']).toBe('/A/one')
  })

  for (const change of ['row', 'view', 'field', 'ABA', 'unmount', 'readonly', 'query invalidation'] as const) {
    it.each(components)(`$name ignores a late result after ${change}`, async ({component}) => {
      const f = await fixture(component)
      await start(f.wrapper)
      if (change === 'row') f.a.setCurrentRowById('two')
      if (change === 'view' || change === 'ABA') f.props.dataViewKey = 'B@Files@default'
      if (change === 'field') f.props.dataField = 'alternate'
      if (change === 'unmount') f.wrapper.unmount()
      if (change === 'readonly') f.props.readonly = true
      if (change === 'query invalidation') f.invalidateQuery()
      await flushPromises()
      if (change === 'ABA') {f.props.dataViewKey = 'A@Files@default'; await flushPromises()}
      f.pending.resolve([uploaded()]); await flushPromises()
      expect(f.a.hasEditingChanges()).toBe(false)
      expect(f.b.hasEditingChanges()).toBe(false)
    })
  }

  it.each(components)('$name keeps an explicit clear when an older action completes', async ({component}) => {
    const f = await fixture(component)
    await start(f.wrapper)
    await f.wrapper.get('.clear-action-button').trigger('click')
    await flushPromises()
    expect(f.a.getEditingRow('one')?.['path']).toBe('')
    f.pending.resolve([uploaded()]); await flushPromises()
    expect(f.a.getEditingRow('one')?.['path']).toBe('')
  })

  it.each(components)('$name preserves the latest selection when an earlier action completes last', async ({component, browse}) => {
    const f = await fixture(component)
    await start(f.wrapper)
    const later = deferred<PageUploadedFile[]>()
    f.transfer.mockReturnValueOnce(later.promise)
    await start(f.wrapper)
    expect(f.transfer).toHaveBeenCalledTimes(2)
    later.resolve([{...uploaded(), name: 'new.docx', url: '/uploads/new.docx'}]); await flushPromises()
    f.pending.resolve([uploaded()]); await flushPromises()
    expect(f.a.getEditingRow('one')?.['path']).toBe(browse ? 'new.docx' : '/uploads/new.docx')
  })

  it.each(components)('$name reports a service failure without editing the bound field', async ({component}) => {
    const f = await fixture(component)
    await start(f.wrapper)
    f.pending.reject(new Error('file service unavailable')); await flushPromises()
    expect(f.showMessage).toHaveBeenCalledWith(expect.stringContaining('file service unavailable'), 'error')
    expect(f.a.hasEditingChanges()).toBe(false)
    expect(f.b.hasEditingChanges()).toBe(false)
  })

  it.each(components)('$name keeps a clear made while the earlier change handler is pending', async ({component}) => {
    const change = deferred<void>()
    const onChange = vi.fn((next: unknown) => next === '' ? undefined : change.promise)
    const f = await fixture(component, onChange)
    await start(f.wrapper)
    f.pending.resolve([uploaded()]); await flushPromises()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(f.a.hasEditingChanges()).toBe(false)
    await f.wrapper.get('.clear-action-button').trigger('click'); await flushPromises()
    expect(f.a.getEditingRow('one')?.['path']).toBe('')
    change.resolve(); await flushPromises()
    expect(f.a.getEditingRow('one')?.['path']).toBe('')
  })

  it.each(components)('$name reports a failed readonly browse without editing', async ({component}) => {
    const f = await fixture(component)
    f.props.readonly = true; await flushPromises()
    await start(f.wrapper)
    expect(f.transfer).toHaveBeenCalledTimes(1)
    f.pending.reject(new Error('browse unavailable')); await flushPromises()
    expect(f.showMessage).toHaveBeenCalledWith(expect.stringContaining('browse unavailable'), 'error')
    expect(f.a.hasEditingChanges()).toBe(false)
  })

  it.each(components.filter(item => !item.browse))('$name retains partial upload feedback after the field is cleared', async ({component}) => {
    const f = await fixture(component)
    await start(f.wrapper)
    await f.wrapper.get('.clear-action-button').trigger('click'); await flushPromises()
    const unconfirmed = {...uploaded(), name: 'unconfirmed.docx'}
    f.pending.reject(new PageUploadError({message: 'upload unconfirmed', confirmedFiles: [uploaded()], unconfirmedFile: unconfirmed}))
    await flushPromises()
    expect(f.showMessage).toHaveBeenCalledWith(expect.stringContaining('proof.docx'), 'error')
    expect(f.showMessage).toHaveBeenCalledWith(expect.stringContaining('unconfirmed.docx'), 'error')
    expect(f.a.getEditingRow('one')?.['path']).toBe('')
  })
})
