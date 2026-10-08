import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { PageRuntime } from '../../../../packages/spark-project-model/src/page/runtime-page'
import { PageTool } from '../../../../packages/spark-project-model/src/page/page-tool'
import { buildPageContext } from '../../../../packages/spark-component/src/page/context/buildPageContext'
import type { PageServiceCapability } from '../../../../packages/spark-component/src/runtime'
import { compileFunctions } from '../../../../packages/spark-component/src/page/createSandbox'
import { SparkData } from '@spark-appworks/spark-data'
const service: PageServiceCapability = {
 copyText:async()=>{},
 showMessage() {}, showConfirm:async()=>true, showPrompt:async()=>null, showAlert:async()=>{}, showDialog:async()=> 'confirm',
 selectEntities:async()=>[], browseFiles:async()=>[], uploadFiles:async()=>[], showLoading() {}, navigate() {},
}
describe('page script call lifetime', () => {
 it('retains a named local draft across contexts and rejects stale revisions', () => {
  const tool = new PageTool({pageId:'P'})
  const runtime = new PageRuntime({tool,scenarioIds:[],loadScenario:async()=>{throw new Error('unexpected')}})
  const firstController = new AbortController()
  const options = {pageRuntime:runtime,pageRoute:{path:'/',fullPath:'/',name:null,params:{},query:{},hash:''},pageContainer:ref(null),pageService:service}
  const first = buildPageContext({...options,signal:firstController.signal})
  const initial = first.$page.getLocalDraft('relation-create:DS-1')
  expect(initial).toEqual({content:undefined,revision:0})
  expect(() => Reflect.apply(first.$page.getLocalDraft, first.$page, [undefined])).toThrow(/NAME/)
  expect(() => Reflect.apply(first.$page.setLocalDraft, first.$page,
    [{name:'relation-create:DS-1',content:undefined,expectedRevision:0}])).toThrow(/CONTENT/)
  expect(() => first.$page.setLocalDraft({name:'relation-create:DS-1',content:'bad',expectedRevision:NaN})).toThrow(/REVISION/)
  expect(first.$page.getLocalDraft('relation-create:DS-1')).toEqual(initial)
  first.$page.setLocalDraft({name:'relation-create:DS-1',content:'{"phase":"input"}',expectedRevision:initial.revision})
  expect(runtime.isDirty).toBe(true)
  const second = buildPageContext({...options,signal:new AbortController().signal})
  expect(second.$page.getLocalDraft('relation-create:DS-1').content).toBe('{"phase":"input"}')
  expect(() => second.$page.setLocalDraft({name:'relation-create:DS-1',content:'old',expectedRevision:0})).toThrow(/STALE/)
  firstController.abort()
  expect(() => first.$page.discardLocalDraft({name:'relation-create:DS-1',expectedRevision:2})).toThrow(/PAGE_RUNTIME_STALE/)
  const current = second.$page.getLocalDraft('relation-create:DS-1')
  second.$page.discardLocalDraft({name:'relation-create:DS-1',expectedRevision:current.revision})
  expect(runtime.isDirty).toBe(false)
  runtime.dispose()
 })
 it('clears owned timers and rejects old call data access after disposal', () => {
  vi.useFakeTimers()
  const tool = new PageTool({pageId:'P'})
  const runtime = new PageRuntime({tool,scenarioIds:[],loadScenario:async()=>{throw new Error('unexpected')}})
  const controller = new AbortController()
  const context = buildPageContext({pageRuntime:runtime,signal:controller.signal,pageRoute:{path:'/',fullPath:'/',name:null,params:{},query:{q:['x',null]},hash:''},pageContainer:ref(null),pageService:service})
  const called = vi.fn()
  context.setTimeout(called,10); context.setInterval(called,10)
  expect(context.$route.query['q']).toEqual(['x',null])
  expect(context).not.toHaveProperty('$dataSet')
  controller.abort();vi.advanceTimersByTime(100)
  expect(called).not.toHaveBeenCalled()
  expect(()=>context.$page.getDataSet('S')).toThrow(/STALE/)
  expect(()=>context.setTimeout(called,10)).toThrow(/STALE/)
  runtime.dispose();vi.useRealTimers()
 })

 it('rejects clipboard calls made after invalidation without invoking the host', async () => {
  const tool = new PageTool({pageId:'P'})
  const runtime = new PageRuntime({tool,scenarioIds:[],loadScenario:async()=>{throw new Error('unexpected')}})
  const controller = new AbortController()
  const copyText = vi.fn(async (_text: string) => {})
  const context = buildPageContext({pageRuntime:runtime,signal:controller.signal,pageRoute:{path:'/',fullPath:'/',name:null,params:{},query:{},hash:''},pageContainer:ref(null),pageService:{...service,copyText}})
  controller.abort()
  await expect(context.$page.copyText('late')).rejects.toThrow(/PAGE_RUNTIME_STALE/)
  expect(copyText).not.toHaveBeenCalled()
  runtime.dispose()
 })

 it.each(['abort', 'dispose'] as const)('does not run script success handling after clipboard wait becomes stale by %s', async invalidation => {
  const tool = new PageTool({pageId:'P'})
  const runtime = new PageRuntime({tool,scenarioIds:[],loadScenario:async()=>{throw new Error('unexpected')}})
  const controller = new AbortController()
  let finishWrite: (() => void) | undefined
  const copyText = vi.fn(() => new Promise<void>(resolve => { finishWrite = resolve }))
  const context = buildPageContext({pageRuntime:runtime,signal:controller.signal,pageRoute:{path:'/',fullPath:'/',name:null,params:{},query:{},hash:''},pageContainer:ref(null),pageService:{...service,copyText}})
  const notify = vi.fn()
  const scriptContext = Object.assign(context, { notify })
  const functions = compileFunctions(`var copy = async function() { await $page.copyText('sent'); notify() }`, scriptContext)
  const pending = functions['copy']!()
  expect(copyText).toHaveBeenCalledWith('sent')
  if (invalidation === 'abort') controller.abort()
  else runtime.dispose()
  finishWrite?.()
  await expect(pending).rejects.toThrow(/PAGE_RUNTIME_STALE/)
  expect(notify).not.toHaveBeenCalled()
  runtime.dispose()
 })

 it('creates one reader only for an explicitly declared and loaded design scenario', async () => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const dataSet = SparkData.createDataSet({ scenarioId: 'DESIGN', dataSetName: 'design', tables: {} })
  const runtime = new PageRuntime({ tool, scenarioIds: ['DESIGN'], loadScenario: async () => dataSet })
  await runtime.load()
  const controller = new AbortController()
  const readDataSpaceLayout = vi.fn(async (_id: string): Promise<string | null> => 'layout')
  const createReader = vi.fn(() => ({ readDataSpaceLayout }))
  const context = buildPageContext({ pageRuntime: runtime, signal: controller.signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service, dataSpaceLayout: { scenarioId: 'DESIGN', createReader } })
  expect(createReader).toHaveBeenCalledTimes(1)
  await expect(context.$page.readDataSpaceLayout('DS-1')).resolves.toBe('layout')
  readDataSpaceLayout.mockResolvedValueOnce(null)
  await expect(context.$page.readDataSpaceLayout('DS-2')).resolves.toBeNull()
  expect(readDataSpaceLayout).toHaveBeenCalledTimes(2)
  expect(createReader).toHaveBeenCalledTimes(1)
  runtime.dispose()
 })

 it('does not create or call a reader when the design scenario was not declared', async () => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const runtime = new PageRuntime({ tool, scenarioIds: [], loadScenario: async () => { throw new Error('unexpected') } })
  await runtime.load()
  const createReader = vi.fn(() => ({ readDataSpaceLayout: vi.fn(async () => 'layout') }))
  const context = buildPageContext({ pageRuntime: runtime, signal: new AbortController().signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service, dataSpaceLayout: { scenarioId: 'DESIGN', createReader } })
  await expect(context.$page.readDataSpaceLayout('DS-1')).rejects.toThrow(/未声明已装载/)
  expect(createReader).not.toHaveBeenCalled()
  runtime.dispose()
 })

 it('does not create a reader when a declared design scenario has not loaded', async () => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const runtime = new PageRuntime({ tool, scenarioIds: ['DESIGN'], loadScenario: async () => { throw new Error('unexpected') } })
  const createReader = vi.fn(() => ({ readDataSpaceLayout: vi.fn(async () => 'layout') }))
  const context = buildPageContext({ pageRuntime: runtime, signal: new AbortController().signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service, dataSpaceLayout: { scenarioId: 'DESIGN', createReader } })
  await expect(context.$page.readDataSpaceLayout('DS-1')).rejects.toThrow(/未声明已装载/)
  expect(createReader).not.toHaveBeenCalled()
  runtime.dispose()
 })

 it('rejects before calling the reader when the page was aborted', async () => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const dataSet = SparkData.createDataSet({ scenarioId: 'DESIGN', dataSetName: 'design', tables: {} })
  const runtime = new PageRuntime({ tool, scenarioIds: ['DESIGN'], loadScenario: async () => dataSet })
  await runtime.load()
  const controller = new AbortController()
  const readDataSpaceLayout = vi.fn(async () => 'layout')
  const context = buildPageContext({ pageRuntime: runtime, signal: controller.signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service,
   dataSpaceLayout: { scenarioId: 'DESIGN', createReader: () => ({ readDataSpaceLayout }) } })
  controller.abort()
  await expect(context.$page.readDataSpaceLayout('DS-1')).rejects.toThrow(/PAGE_RUNTIME_STALE/)
  expect(readDataSpaceLayout).not.toHaveBeenCalled()
  runtime.dispose()
 })

 it.each(['abort', 'dispose', 'reload'] as const)('rejects a layout result that arrives after page %s', async invalidation => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const runtime = new PageRuntime({ tool, scenarioIds: ['DESIGN'], loadScenario: async scenarioId =>
    SparkData.createDataSet({ scenarioId, dataSetName: 'design', tables: {} }) })
  await runtime.load()
  const controller = new AbortController()
  let finish: ((value: string) => void) | undefined
  const reader = { readDataSpaceLayout: vi.fn(() => new Promise<string>(resolve => { finish = resolve })) }
  const context = buildPageContext({ pageRuntime: runtime, signal: controller.signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service,
   dataSpaceLayout: { scenarioId: 'DESIGN', createReader: () => reader } })
  const pending = context.$page.readDataSpaceLayout('DS-1')
  if (invalidation === 'abort') controller.abort()
  else if (invalidation === 'dispose') runtime.dispose()
  else await runtime.reload()
  finish?.('layout')
  await expect(pending).rejects.toThrow(/PAGE_RUNTIME_STALE/)
  runtime.dispose()
 })

 it('rejects a late reader failure after page abort', async () => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const dataSet = SparkData.createDataSet({ scenarioId: 'DESIGN', dataSetName: 'design', tables: {} })
  const runtime = new PageRuntime({ tool, scenarioIds: ['DESIGN'], loadScenario: async () => dataSet })
  await runtime.load()
  const controller = new AbortController()
  let fail: ((error: Error) => void) | undefined
  const reader = { readDataSpaceLayout: vi.fn(() => new Promise<string>((_resolve, reject) => { fail = reject })) }
  const context = buildPageContext({ pageRuntime: runtime, signal: controller.signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service,
   dataSpaceLayout: { scenarioId: 'DESIGN', createReader: () => reader } })
  const pending = context.$page.readDataSpaceLayout('DS-1')
  controller.abort()
  fail?.(new Error('late host failure'))
  await expect(pending).rejects.toThrow(/PAGE_RUNTIME_STALE/)
  runtime.dispose()
 })

 it('creates restricted design and layout readers only for the loaded design scenario', async () => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const dataSet = SparkData.createDataSet({ scenarioId: 'DESIGN', dataSetName: 'design', tables: {} })
  const runtime = new PageRuntime({ tool, scenarioIds: ['DESIGN'], loadScenario: async () => dataSet })
  await runtime.load()
  const readRelationDependencyOptions = vi.fn(async () => [{ label: 'Foreign key', value: 'FK' }])
  const saveDataSpaceLayout = vi.fn(async () => {})
  const createDataSpaceLayout = vi.fn(async () => {})
  const createDesignReader = vi.fn(() => ({ readRelationDependencyOptions }))
  const createWriter = vi.fn(() => ({ saveDataSpaceLayout, createDataSpaceLayout }))
  const context = buildPageContext({ pageRuntime: runtime, signal: new AbortController().signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service,
   dataSpaceDesign: { scenarioId: 'DESIGN', createReader: createDesignReader },
   dataSpaceLayout: { scenarioId: 'DESIGN', createReader: () => ({ readDataSpaceLayout: async id => id === 'DS-1' ? '{}' : null }), createWriter } })
  await expect(context.$page.readDataSpaceRelationDependencyOptions()).resolves.toEqual([{ label: 'Foreign key', value: 'FK' }])
  await context.$page.readDataSpaceLayout('DS-1')
  await context.$page.readDataSpaceLayout('DS-2')
  await expect(context.$page.saveDataSpaceLayout({ dataSpaceId: 'DS-1', content: '{}', expectedContent: '{}' }))
   .resolves.toBeUndefined()
  await expect(context.$page.createDataSpaceLayout({ dataSpaceId: 'DS-2', content: '{}' }))
   .resolves.toBeUndefined()
  expect(createDesignReader).toHaveBeenCalledOnce()
  expect(createWriter).toHaveBeenCalledOnce()
  expect(readRelationDependencyOptions).toHaveBeenCalledOnce()
  expect(saveDataSpaceLayout).toHaveBeenCalledOnce()
  expect(createDataSpaceLayout).toHaveBeenCalledOnce()
  runtime.dispose()
 })

 it.each(['abort', 'dispose'] as const)('rejects a late first-layout creation result after page %s', async invalidation => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const runtime = new PageRuntime({ tool, scenarioIds: ['DESIGN'], loadScenario: async scenarioId =>
   SparkData.createDataSet({ scenarioId, dataSetName: 'design', tables: {} }) })
  await runtime.load()
  const controller = new AbortController()
  let finish: (() => void) | undefined
  const createDataSpaceLayout = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const context = buildPageContext({ pageRuntime: runtime, signal: controller.signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service,
   dataSpaceLayout: { scenarioId: 'DESIGN', createReader: () => ({ readDataSpaceLayout: async () => null }),
    createWriter: () => ({ saveDataSpaceLayout: async () => undefined, createDataSpaceLayout }) } })
  await context.$page.readDataSpaceLayout('DS-1')
  const pending = context.$page.createDataSpaceLayout({dataSpaceId: 'DS-1', content: '{}'})
  if (invalidation === 'abort') controller.abort()
  else runtime.dispose()
  finish?.()
  await expect(pending).rejects.toThrow(/PAGE_RUNTIME_STALE/)
  expect(createDataSpaceLayout).toHaveBeenCalledOnce()
  if (invalidation === 'abort') expect(runtime.getContent('DESIGN@DS-1').baseline).toBe('{}')
  runtime.dispose()
 })

 it('keeps normal layout reads away from a pending or unknown write and adopts only a real reread', async () => {
  const tool = new PageTool({pageId:'P'})
  tool.hydrateFileText('rule.json','[]');tool.hydrateFileText('script.js','');tool.hydrateFileText('style.css','');tool.markLoaded()
  const runtime = new PageRuntime({tool,scenarioIds:['DESIGN'],loadScenario:async scenarioId =>
   SparkData.createDataSet({scenarioId,dataSetName:'design',tables:{}})})
  await runtime.load()
  const readDataSpaceLayout = vi.fn(async () => 'old')
  let fail: ((reason: Error) => void) | undefined
  const saveDataSpaceLayout = vi.fn(() => new Promise<void>((_resolve,reject) => {fail=reject}))
  const context = buildPageContext({pageRuntime:runtime,signal:new AbortController().signal,
   pageRoute:{path:'/',fullPath:'/',name:null,params:{},query:{},hash:''},pageContainer:ref(null),pageService:service,
   dataSpaceLayout:{scenarioId:'DESIGN',createReader:()=>({readDataSpaceLayout}),
    createWriter:()=>({saveDataSpaceLayout,createDataSpaceLayout:async()=>undefined})}})
  await context.$page.readDataSpaceLayout('DS-1')
  const pending = context.$page.saveDataSpaceLayout({dataSpaceId:'DS-1',content:'new',expectedContent:'old'})
  await expect(context.$page.readDataSpaceLayout('DS-1')).rejects.toThrow('PAGE_CONTENT_BUSY')
  expect(readDataSpaceLayout).toHaveBeenCalledOnce()
  fail?.(new Error('write result unknown'))
  await expect(pending).rejects.toThrow('write result unknown')
  expect(context.$page.getDataSpaceLayoutContent('DS-1').status).toBe('unknown')
  await expect(context.$page.readDataSpaceLayout('DS-1')).rejects.toThrow('PAGE_CONTENT_BUSY')
  expect(readDataSpaceLayout).toHaveBeenCalledOnce()
  const remote = await context.$page.readDataSpaceLayoutForAdoption('DS-1')
  expect(remote.content).toBe('old')
  context.$page.adoptDataSpaceLayoutRead('DS-1',remote)
  expect(context.$page.getDataSpaceLayoutContent('DS-1').status).toBe('idle')
  expect(readDataSpaceLayout).toHaveBeenCalledTimes(2)
  runtime.dispose()
 })

 it('does not create restricted design readers when the design scenario is undeclared or unloaded', async () => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const runtime = new PageRuntime({ tool, scenarioIds: [], loadScenario: async () => { throw new Error('unexpected') } })
  await runtime.load()
  const createReader = vi.fn(() => ({ readRelationDependencyOptions: vi.fn(async () => []) }))
  const createWriter = vi.fn(() => ({ saveDataSpaceLayout: vi.fn(async () => undefined),
   createDataSpaceLayout: vi.fn(async () => undefined) }))
  const context = buildPageContext({ pageRuntime: runtime, signal: new AbortController().signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service,
   dataSpaceDesign: { scenarioId: 'DESIGN', createReader },
   dataSpaceLayout: { scenarioId: 'DESIGN', createReader: () => ({ readDataSpaceLayout: async () => null }), createWriter } })
  await expect(context.$page.readDataSpaceRelationDependencyOptions()).rejects.toThrow(/未声明已装载/)
  await expect(context.$page.saveDataSpaceLayout({ dataSpaceId: 'DS-1', content: '{}', expectedContent: '{}' }))
   .rejects.toThrow(/未声明已装载/)
  expect(createReader).not.toHaveBeenCalled()
  expect(createWriter).not.toHaveBeenCalled()
  runtime.dispose()
 })

 it('does not create design factories when a declared design scenario is not loaded', () => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const runtime = new PageRuntime({ tool, scenarioIds: ['DESIGN'], loadScenario: async () => { throw new Error('unexpected') } })
  const createReader = vi.fn(() => ({ readRelationDependencyOptions: vi.fn(async () => []) }))
  const createWriter = vi.fn(() => ({ saveDataSpaceLayout: vi.fn(async () => undefined),
   createDataSpaceLayout: vi.fn(async () => undefined) }))
  buildPageContext({ pageRuntime: runtime, signal: new AbortController().signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service,
   dataSpaceDesign: { scenarioId: 'DESIGN', createReader },
   dataSpaceLayout: { scenarioId: 'DESIGN', createReader: () => ({ readDataSpaceLayout: async () => null }), createWriter } })
  expect(createReader).not.toHaveBeenCalled()
  expect(createWriter).not.toHaveBeenCalled()
  runtime.dispose()
 })

 it.each(['abort', 'reload'] as const)('rejects a late dictionary result after page %s', async invalidation => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const runtime = new PageRuntime({ tool, scenarioIds: ['DESIGN'], loadScenario: async scenarioId =>
    SparkData.createDataSet({ scenarioId, dataSetName: 'design', tables: {} }) })
  await runtime.load()
  const controller = new AbortController()
  let finish: ((options: readonly { label: string; value: string }[]) => void) | undefined
  const readRelationDependencyOptions = vi.fn(() => new Promise<readonly { label: string; value: string }[]>(resolve => { finish = resolve }))
  const context = buildPageContext({ pageRuntime: runtime, signal: controller.signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service,
   dataSpaceDesign: { scenarioId: 'DESIGN', createReader: () => ({ readRelationDependencyOptions }) } })
  const pending = context.$page.readDataSpaceRelationDependencyOptions()
  if (invalidation === 'abort') controller.abort()
  else await runtime.reload()
  finish?.([])
  await expect(pending).rejects.toThrow(/PAGE_RUNTIME_STALE/)
  runtime.dispose()
 })

 it('rejects a late dictionary failure after page invalidation', async () => {
  const tool = new PageTool({ pageId: 'P' })
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const dataSet = SparkData.createDataSet({ scenarioId: 'DESIGN', dataSetName: 'design', tables: {} })
  const runtime = new PageRuntime({ tool, scenarioIds: ['DESIGN'], loadScenario: async () => dataSet })
  await runtime.load()
  const controller = new AbortController()
  let fail: ((reason: Error) => void) | undefined
  const readRelationDependencyOptions = vi.fn(() => new Promise<readonly { label: string; value: string }[]>((_resolve, reject) => { fail = reject }))
  const context = buildPageContext({ pageRuntime: runtime, signal: controller.signal,
   pageRoute: { path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: '' },
   pageContainer: ref(null), pageService: service,
   dataSpaceDesign: { scenarioId: 'DESIGN', createReader: () => ({ readRelationDependencyOptions }) } })
  const pending = context.$page.readDataSpaceRelationDependencyOptions()
  controller.abort()
  fail?.(new Error('late host failure'))
  await expect(pending).rejects.toThrow(/PAGE_RUNTIME_STALE/)
  runtime.dispose()
 })

 it('requires a loaded design source reader and rejects late source rows after page invalidation', async () => {
  const tool = new PageTool({pageId: 'P'})
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const runtime = new PageRuntime({tool, scenarioIds: ['DESIGN'], loadScenario: async scenarioId =>
    SparkData.createDataSet({scenarioId, dataSetName: 'design', tables: {}})})
  await runtime.load()
  const controller = new AbortController()
  let finish: ((result: {rows: []; total: number}) => void) | undefined
  const query = vi.fn(() => new Promise<{rows: []; total: number}>(resolve => {finish = resolve}))
  const context = buildPageContext({pageRuntime: runtime, signal: controller.signal,
   pageRoute: {path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: ''},
   pageContainer: ref(null), pageService: service,
   dataSpaceDesign: {scenarioId: 'DESIGN', createReader: () => ({readRelationDependencyOptions: async () => [],
    modelSources: {query, prepare: async () => {throw new Error('not used')}}})}})
  const pending = context.$page.readDataSpaceModelSources({type: 'table'})
  controller.abort()
  finish?.({rows: [], total: 0})
  await expect(pending).rejects.toThrow(/PAGE_RUNTIME_STALE/)
  expect(query).toHaveBeenCalledOnce()
  runtime.dispose()

  const missing = new PageRuntime({tool, scenarioIds: [], loadScenario: async () => {throw new Error('unexpected')}})
  await missing.load()
  const noReader = buildPageContext({pageRuntime: missing, signal: new AbortController().signal,
   pageRoute: {path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: ''},
   pageContainer: ref(null), pageService: service})
  await expect(noReader.$page.readDataSpaceModelSources({type: 'table'})).rejects.toThrow(/UNAVAILABLE/)
  await expect(noReader.$page.prepareDataSpaceModelSource({type: 'table', id: 'T', name: 'T', description: '',
   dbid: '', databaseName: '', providerId: ''})).rejects.toThrow(/UNAVAILABLE/)
  missing.dispose()
 })
})
