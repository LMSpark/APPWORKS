import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { PageRuntime } from '../../../packages/spark-project-model/src/page/runtime-page'
import { PageTool } from '../../../packages/spark-project-model/src/page/page-tool'
import { buildPageContext } from '../../../packages/spark-component/src/page/context/buildPageContext'
import type { PageServiceCapability } from '../../../packages/spark-component/src/runtime'
const service: PageServiceCapability = {
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
})
