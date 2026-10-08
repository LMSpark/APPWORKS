import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { PageRuntime } from '../../../../packages/spark-project-model/src/page/runtime-page'
import { PageTool } from '../../../../packages/spark-project-model/src/page/page-tool'
import { buildPageContext } from '../../../../packages/spark-component/src/page/context/buildPageContext'
import type { PageServiceCapability } from '../../../../packages/spark-component/src/runtime'
import { compileFunctions } from '../../../../packages/spark-component/src/page/createSandbox'
const service: PageServiceCapability = {
 copyText:async()=>{},
 showMessage() {}, showConfirm:async()=>true, showPrompt:async()=>null, showAlert:async()=>{}, showDialog:async()=> 'confirm',
 selectEntities:async()=>[], browseFiles:async()=>[], uploadFiles:async()=>[], showLoading() {}, navigate() {},
}
describe('page script call lifetime', () => {
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
