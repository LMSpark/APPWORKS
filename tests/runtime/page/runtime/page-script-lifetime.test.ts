import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { PageRuntime } from '../../../../packages/spark-project-model/src/page/runtime-page'
import { PageTool } from '../../../../packages/spark-project-model/src/page/page-tool'
import { buildPageContext } from '../../../../packages/spark-component/src/page/context/buildPageContext'
import type { PageServiceCapability } from '../../../../packages/spark-component/src/runtime'
import { compileFunctions } from '../../../../packages/spark-component/src/page/createSandbox'
import { SparkData } from '@spark-appworks/spark-data'
import { appPageUiService, appPageUiState, closeAppSelector } from '@spark-appworks/spark-app'
const service: PageServiceCapability = {
 copyText:async()=>{},
 showMessage() {}, showConfirm:async()=>true, showPrompt:async()=>null, showAlert:async()=>{}, showDialog:async()=> 'confirm',
 selectEntities:async()=>[], browseFiles:async()=>[], uploadFiles:async()=>[], showLoading() {}, navigate() {},
}
describe('page script call lifetime', () => {
 it.each(['page', 'caller'])('dismisses the script selector when the %s signal is aborted', async origin => {
  const runtime = new PageRuntime({pageId:'P',scenarioIds:[],loadScenario:async()=>{throw Error('unexpected')}})
  const page = new AbortController(), caller = new AbortController()
  const context = buildPageContext({pageRuntime:runtime,signal:page.signal,
   pageRoute:{path:'/',fullPath:'/',name:null,params:{},query:{},hash:''},pageContainer:ref(null),
   pageService:{...service,...appPageUiService}})
  try {
   const pending = context.$page.selectEntities({signal:caller.signal, options:[{label:'张三',value:'U1'}]})
   expect(appPageUiState.selector.visible).toBe(true)
   if (origin === 'page') {
    page.abort()
    await expect(pending).rejects.toThrow('PAGE_RUNTIME_STALE')
   } else {
    caller.abort()
    await expect(pending).resolves.toBeNull()
   }
   expect(appPageUiState.selector.visible).toBe(false)
   expect(appPageUiState.selector.options).toEqual([])
  } finally {
   closeAppSelector()
   runtime.dispose()
  }
 })

 it('checks the authenticated host before dispatch and after asynchronous completion', async () => {
  const runtime = new PageRuntime({pageId:'P',scenarioIds:[],loadScenario:async()=>{throw Error('unexpected')}})
  const controller = new AbortController()
  let authenticated = true
  let finish: ((value: string) => void) | undefined
  const invoke = vi.fn(() => new Promise<string>(resolve => {finish = resolve}))
  const context = buildPageContext({pageRuntime:runtime,signal:controller.signal,
   pageRoute:{path:'/',fullPath:'/',name:null,params:{},query:{},hash:''},pageContainer:ref(null),pageService:service,
   host:{runtime,invoke,assertCurrent(){if (!authenticated) throw Error('HOST_STALE')}}})
  try {
   const pending = context.$page.invokeHostCommand('edit', {id:'draft'})
   expect(invoke).toHaveBeenCalledWith('edit',{id:'draft'},controller.signal)
   authenticated = false
   finish?.('saved')
   await expect(pending).rejects.toThrow('HOST_STALE')
   await expect(context.$page.invokeHostCommand('edit')).rejects.toThrow('HOST_STALE')
   expect(invoke).toHaveBeenCalledOnce()
  } finally {runtime.dispose()}
 })
 it('exposes data operations through the runtime DataSet instead of separate design storage methods', async () => {
  const tool = new PageTool({pageId: 'P'})
  tool.hydrateFileText('rule.json', '[]'); tool.hydrateFileText('script.js', ''); tool.hydrateFileText('style.css', ''); tool.markLoaded()
  const dataSet = SparkData.createDataSet({scenarioId: 'DESIGN', dataSetName: 'design', tables: {}})
  const runtime = new PageRuntime({tool, scenarioIds: ['DESIGN'], loadScenario: async () => dataSet})
  await runtime.load()
  const controller = new AbortController()
  const context = buildPageContext({pageRuntime: runtime, signal: controller.signal,
   pageRoute: {path: '/', fullPath: '/', name: null, params: {}, query: {}, hash: ''}, pageContainer: ref(null), pageService: service})
  try {
   expect(context.$page.getDataSet('DESIGN')).toBe(dataSet)
   expect(Object.keys(context.$page).sort()).toEqual([...Object.keys(service), 'getDataSet', 'resolveView', 'invokeHostCommand'].sort())
   await expect(context.$page.invokeHostCommand('edit')).rejects.toThrow('PAGE_HOST_COMMAND_UNAVAILABLE')
   controller.abort()
   expect(() => context.$page.getDataSet('DESIGN')).toThrow('PAGE_RUNTIME_STALE')
  } finally { runtime.dispose() }
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
})
