import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, reactive} from 'vue'
import ElementPlus from 'element-plus'
import {DataSet, type DataRow} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {FieldText, PAGE_RUNTIME, Spark, useSparkComponent} from '@spark-appworks/spark-component'
import {DataSpaceQueryTable} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {bindBlueprintReadonlyView} from '@/views/app/dev-system/blueprint-workspace/blueprint-readonly-info'
import BlueprintReadonlyInfo from '@/views/app/dev-system/blueprint-workspace/BlueprintReadonlyInfo.vue'

const release: Array<() => void> = []
const originalStubs = config.global.stubs
afterEach(() => {
  release.splice(0).reverse().forEach(dispose => dispose())
  config.global.stubs = originalStubs
  vi.unstubAllGlobals()
})

async function realReadonlyView(modelName = 'Base_Navigation_Desc_Version') {
  const dataSet = DataSet.fromJson({scenarioId: 'scene', tables: {History: {
    modelBinding: {modelId: 'history-model', modelName},
    columns: ['rowid', 'prowid', 'desc'].map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
    views: {default: {autoLoad: false, pageSize: 2}},
  }}})
  const view = dataSet.getView('History')!
  const requests: Array<{node: unknown; page: number | undefined; resolve: (rows: DataRow[], total?: number, reported?: boolean) => void; reject: (error: Error) => void}> = []
  view.bindQueryExecutor({executeQuery: (_view, params) => new Promise((resolve, reject) => {
    requests.push({node: (params.filter as {value?: unknown} | undefined)?.value, page: params.page,
      reject,
      resolve: (rows, total = rows.length, reported = true) => {
        const source = new DataSpaceQueryTable({scenarioId: 'scene', metaName: modelName})
        resolve(new DataSpaceQueryContext({identity: source.identity, scope: 'readonly-info', readScope: () => 'readonly-info',
          snapshot: source.applyResult({Result: {primaryKeyField: 'rowid', data: {Items: rows, ...(reported ? {Count: total} : {})}}})}))
      },
    })
  })})
  const runtime = new PageRuntime({pageId: 'readonly', scenarioIds: ['scene'], loadScenario: async () => dataSet})
  await runtime.load()
  release.push(() => runtime.dispose())
  return {runtime, view, requests, binding: `scene@${modelName}@default`}
}

function bind(f: Awaited<ReturnType<typeof realReadonlyView>>, nodeId = 'A', assertCurrent = () => {}) {
  const session = bindBlueprintReadonlyView({...f, nodeId, assertCurrent})
  release.push(() => session.release())
  return session
}

async function mountInfo(f: Awaited<ReturnType<typeof realReadonlyView>>) {
  const stubs = {...config.global.stubs}
  for (const name of ['el-table', 'el-table-column', 'el-button', 'el-tag', 'SparkComponentRenderer', 'spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
  const registry = Spark.createRegistry()
  registry.register({type: 'r-text', component: FieldText})
  const props = reactive({nodeId: 'A', mounted: true})
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'readonly-info-host'})
    sparkProvide(PAGE_RUNTIME, f.runtime)
    return () => props.mounted ? h(BlueprintReadonlyInfo, {key: props.nodeId, runtime: f.runtime, nodeId: props.nodeId,
      binding: f.binding, fields: ['rowid', 'prowid', 'desc'], assertCurrent: (nodeId: string, runtime: PageRuntime) => {
        if (nodeId !== props.nodeId || runtime !== f.runtime) throw new Error('scope stale')
      }}) : null
  }}), {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin({registry})]}})
  release.push(() => wrapper.unmount())
  await flushPromises()
  return {wrapper, props}
}

function reload(wrapper: VueWrapper) {
  const button = wrapper.findAll('button').find(candidate => candidate.text().includes('重新加载'))
  expect(button, 'the failed query must have a retry action').toBeDefined()
  return button!.trigger('click')
}

describe('blueprint readonly real DataView query lifecycle', () => {
  it('keeps the newer node result when the old node query completes late', async () => {
    const f = await realReadonlyView()
    let currentNode = 'A'
    const first = bind(f, 'A', () => {
      if (currentNode !== 'A') throw new Error('scope stale')
    })
    const old = first.load().then(() => undefined, error => error)
    await flushPromises()
    currentNode = 'B'
    const second = bind(f, 'B', () => {
      if (currentNode !== 'B') throw new Error('scope stale')
    })
    const next = second.load()
    await flushPromises()
    expect(f.requests.map(request => request.node)).toEqual(['A', 'B'])
    f.requests[1]!.resolve([{rowid: 'B-1', prowid: 'B', desc: 'current result'}]); await next
    expect(f.view.rows).toHaveLength(1)
    f.requests[0]!.resolve([{rowid: 'A-1', prowid: 'A', desc: 'obsolete result'}]); await old
    expect(f.view.rows).toEqual([expect.objectContaining({rowid: 'B-1', prowid: 'B'})])
    expect(f.view.total).toBe(1)
    expect(f.view.filterExpression).toMatchObject({value: 'B'})
    first.release()
    expect(f.view.rows).toHaveLength(1)
  })

  it('rejects a wrong-node result before any row consumer sees it', async () => {
    const f = await realReadonlyView(), observed: unknown[] = []
    f.view.events.on('rowsChanged', () => {observed.push(...f.view.rows.map(row => row['prowid']))})
    const pending = bind(f).load().then(() => undefined, error => error)
    await flushPromises()
    f.requests[0]!.resolve([{rowid: 'B-1', prowid: 'B', desc: 'wrong result'}])
    expect(await pending).toBeInstanceOf(Error)
    expect(observed).not.toContain('B')
    expect(f.view.rows).toEqual([])
  })

  it.each([
    {name: 'hidden target', rows: [{rowid: '1', prowid: 'A', lingma_sys_params: {r: [], e: [], h: ['prowid'], m: [], d: false}}]},
    {name: 'hidden row identity', rows: [{rowid: '1', prowid: 'A', lingma_sys_params: {r: [], e: [], h: ['rowid'], m: [], d: false}}]},
    {name: 'empty identity', rows: [{rowid: '', prowid: 'A'}]},
    {name: 'duplicate identity', rows: [{rowid: '1', prowid: 'A'}, {rowid: '1', prowid: 'A'}]},
    {name: 'short page', rows: [{rowid: '1', prowid: 'A'}], total: 3},
    {name: 'missing total', rows: [{rowid: '1', prowid: 'A'}], reported: false},
  ])('rejects $name before result ingestion', async ({rows, total, reported}) => {
    const f = await realReadonlyView(), observed: DataRow[] = []
    f.view.events.on('rowsChanged', () => {observed.push(...f.view.rows)})
    const pending = bind(f).load().then(() => undefined, error => error)
    await flushPromises()
    f.requests[0]!.resolve(rows, total, reported)
    expect(await pending).toBeInstanceOf(Error)
    expect(observed).toEqual([])
  })

  it('checks binding identity before changing an unrelated view', async () => {
    const f = await realReadonlyView()
    f.view.filterExpression = {field: 'prowid', operator: 'eq', value: 'original'}
    const reset = vi.spyOn(f.view, 'resetState')
    expect(() => bind({...f, binding: 'other@Base_Navigation_Desc_Version@default'})).toThrow()
    expect(reset).not.toHaveBeenCalled()
    expect(f.view.filterExpression).toMatchObject({value: 'original'})
    expect(f.requests).toHaveLength(0)
  })

  it('chains the prior validator and restores it after idle release', async () => {
    const f = await realReadonlyView(), original = vi.fn()
    f.view.validateQueryResult = original
    const session = bind(f), pending = session.load()
    await flushPromises(); f.requests[0]!.resolve([{rowid: 'A-1', prowid: 'A'}]); await pending
    expect(original).toHaveBeenCalledTimes(1)
    const rows = f.view.rows
    session.release()
    expect(f.view.validateQueryResult).toBe(original)
    expect(f.view.rows).toBe(rows)
  })

  it('rejects pending results after release and restores the original validator when settled', async () => {
    const f = await realReadonlyView(), original = vi.fn()
    f.view.validateQueryResult = original
    const session = bind(f), pending = session.load().then(() => undefined, error => error)
    await flushPromises(); session.release()
    f.requests[0]!.resolve([{rowid: 'A-1', prowid: 'A'}]); await pending
    expect(f.view.rows).toEqual([])
    expect(f.view.validateQueryResult).toBe(original)
  })

  it('does not restore over a validator installed by a later consumer', async () => {
    const f = await realReadonlyView(), session = bind(f), later = vi.fn()
    f.view.validateQueryResult = later
    session.release()
    expect(f.view.validateQueryResult).toBe(later)
  })

  it.each(['release', 'replace'] as const)('rechecks the binding after an asynchronous prior validator: %s', async action => {
    const f = await realReadonlyView(), observed: unknown[] = []
    let finishValidation!: () => void
    const gate = new Promise<void>(resolve => {finishValidation = resolve})
    const original = vi.fn().mockImplementationOnce(() => gate)
    f.view.validateQueryResult = original
    f.view.events.on('rowsChanged', () => {observed.push(...f.view.rows.map(row => row['prowid']))})
    const first = bind(f), pending = first.load().then(() => undefined, error => error)
    await flushPromises()
    f.requests[0]!.resolve([{rowid: 'A-1', prowid: 'A'}]); await flushPromises()
    expect(original).toHaveBeenCalledTimes(1)
    first.release()
    if (action === 'replace') {
      const second = bind(f, 'B'), next = second.load()
      await flushPromises()
      f.requests[1]!.resolve([{rowid: 'B-1', prowid: 'B'}]); await next
    }
    finishValidation(); await pending
    expect(observed).not.toContain('A')
    if (action === 'replace') expect(f.view.rows).toEqual([expect.objectContaining({prowid: 'B'})])
    else {
      expect(f.view.rows).toEqual([])
      expect(f.view.validateQueryResult).toBe(original)
    }
  })

  it('refuses a new binding before changing a view that contains pending edits', async () => {
    const f = await realReadonlyView(), first = bind(f), pending = first.load()
    await flushPromises()
    f.requests[0]!.resolve([{rowid: 'A-1', prowid: 'A', desc: 'original'}]); await pending
    f.view.updateEditingValue('A-1', 'desc', 'unsaved')
    const validator = f.view.validateQueryResult
    expect(() => bind(f, 'B')).toThrow()
    expect(f.view.validateQueryResult).toBe(validator)
    expect(f.view.filterExpression).toMatchObject({value: 'A'})
    expect(f.view.getEditingRow('A-1')?.['desc']).toBe('unsaved')
    expect(f.requests).toHaveLength(1)
  })

  it.each(['Base_Navigation_Desc_Version', 'Base_Navigation_DataRelation'])('%s uses standard table paging and validates each response', async modelName => {
    const f = await realReadonlyView(modelName), {wrapper} = await mountInfo(f)
    f.requests[0]!.resolve([{rowid: 'A-1', prowid: 'A', desc: 'first'}, {rowid: 'A-2', prowid: 'A', desc: 'second'}], 3)
    await flushPromises()
    expect(wrapper.text()).toContain('first')
    await wrapper.get('.el-pagination .btn-next').trigger('click'); await flushPromises()
    expect(f.requests[1]).toMatchObject({node: 'A', page: 2})
    f.requests[1]!.resolve([{rowid: 'A-3', prowid: 'A', desc: 'last page'}], 3); await flushPromises()
    expect(f.view.rows).toEqual([expect.objectContaining({rowid: 'A-3'})])
    expect(wrapper.text()).toContain('last page')
    await wrapper.get('.el-pagination .btn-prev').trigger('click'); await flushPromises()
    const observed: unknown[] = []
    f.view.events.on('rowsChanged', () => {observed.push(...f.view.rows.map(row => row['prowid']))})
    f.requests[2]!.resolve([{rowid: 'B-1', prowid: 'B', desc: 'wrong page'}, {rowid: 'B-2', prowid: 'B'}], 3)
    await flushPromises()
    expect(observed).not.toContain('B')
    expect(f.view.loadingError).toBeInstanceOf(Error)
    expect(wrapper.text()).toContain(f.view.loadingError!.message)
    expect(wrapper.text()).not.toContain('wrong page')
    await reload(wrapper); await flushPromises()
    expect(f.requests[3]).toMatchObject({node: 'A', page: 1})
    f.requests[3]!.resolve([{rowid: 'A-4', prowid: 'A', desc: 'recovered'}]); await flushPromises()
    expect(wrapper.text()).toContain('recovered')
    expect(f.view.loadingError).toBeNull()
  })

  it('keeps the new keyed component result after the old component unmounts', async () => {
    const f = await realReadonlyView(), {wrapper, props} = await mountInfo(f)
    props.nodeId = 'B'; await flushPromises()
    f.requests[1]!.resolve([{rowid: 'B-1', prowid: 'B', desc: 'current node'}]); await flushPromises()
    f.requests[0]!.resolve([{rowid: 'A-1', prowid: 'A', desc: 'old node'}]); await flushPromises()
    expect(wrapper.text()).toContain('current node')
    expect(wrapper.text()).not.toContain('old node')
    expect(f.view.rows).toHaveLength(1)
  })

  it('shows an initial network failure and allows a successful same-target retry', async () => {
    const f = await realReadonlyView(), {wrapper} = await mountInfo(f)
    f.requests[0]!.reject(new Error('history query unavailable')); await flushPromises()
    expect(wrapper.text()).toContain('history query unavailable')
    await reload(wrapper); await flushPromises()
    f.requests[1]!.resolve([{rowid: 'A-1', prowid: 'A', desc: 'retry succeeded'}]); await flushPromises()
    expect(wrapper.text()).toContain('retry succeeded')
  })
})
