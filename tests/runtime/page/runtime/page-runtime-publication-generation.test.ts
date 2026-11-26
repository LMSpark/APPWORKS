import {expect, it, vi} from 'vitest'
import {defineComponent, h} from 'vue'
import {createMemoryHistory, createRouter} from 'vue-router'
import {SparkData} from '@spark-appworks/spark-data'
import {
  PageRuntimePool,
  type RuntimePageNavigationReceipt,
  type RuntimePagePublicationResolution,
  type PageRuntimePoolOptions,
} from '../../../../packages/spark-app/src/router/page-runtime-pool'

const files = [{fileName: 'rule.json', version: 1, text: '[]'},
  {fileName: 'script.js', version: 1, text: ''}, {fileName: 'style.css', version: 1, text: ''}] as const

async function proof(sourceRevision: string, assertCurrent: () => void): Promise<RuntimePagePublicationResolution> {
  const fileProofs = await Promise.all(files.map(async ({fileName, version, text}) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    return {fileName, version, sha256}
  }))
  return {publicationRef: sourceRevision, assertCurrent,
    manifest: {schemaVersion: 2, pageId: 'TOOL', sourceRevision, scenarioIds: ['SCENE'], files: fileProofs,
      dataset: [{scenarioId: 'SCENE', fileName: 'SCENE.dataset.json', sha256: 'formal-proof', sourceRevision: 'plan'}]}}
}

async function openTool(options: Pick<PageRuntimePoolOptions, 'resolvePagePublication' | 'resolvePageNavigationReceipt' | 'loadScenario'>) {
  const page = defineComponent({render: () => h('div')})
  const routeTool = {projectId: 'APP', pageId: 'TOOL'}
  const path = '/tool'
  const router = createRouter({history: createMemoryHistory(), routes: [{
    path, component: page, meta: {type: 'config-page', nodeId: 'NODE', tool: routeTool, blueprintScenarioId: 'SCENE'},
  }]})
  await router.push(path)
  const pool = new PageRuntimePool({pageComponent: page, readPageFile: undefined,
    readPageFiles: async commands => commands.map(command => command.fileName === 'rule.json' ? '[]' : ''),
    readCurrentRoute: () => router.currentRoute.value,
    readNavTree: () => ({title: 'App', childPlacement: 'header', items: [
      {id: 'NODE', title: 'Tool', path, tool: routeTool, blueprintScenarioId: 'SCENE'},
    ]}),
    refreshRoutes: async () => undefined,
    ...options,
  })
  const route = router.currentRoute.value
  const runtime = pool.getPageRuntime(route)
  if (!runtime) throw Error('缺少配置页调用')
  return {pool, route, runtime}
}

it.each(['navigation receipt', 'publication resolver'] as const)(
  'rejects and releases a scenario returned after its %s proof becomes stale',
  async kind => {
    let valid = true
    const publication = await proof('release-1', () => {if (!valid) throw Error('PUBLICATION_STALE')})
    const dataSet = SparkData.createDataSet({dataSetName: 'Scene', scenarioId: 'SCENE', tables: {}})
    const loadScenario = vi.fn(async () => {
      valid = false
      return dataSet
    })
    const {runtime} = await openTool({
      ...(kind === 'navigation receipt'
        ? {resolvePageNavigationReceipt: async () => ({state: 'READY', publication, files, assertCurrent: () => {}})}
        : {resolvePagePublication: async () => publication}),
      loadScenario,
    })
    try {
      await expect(runtime.load()).rejects.toThrow('PUBLICATION_STALE')
      expect(loadScenario).toHaveBeenCalledOnce()
      expect(runtime.isLoaded).toBe(false)
      expect(runtime.getDataSet('SCENE')).toBeUndefined()
      expect(dataSet.destroyed).toBe(true)
    } finally {
      runtime.dispose()
      if (!dataSet.destroyed) dataSet.destroy()
    }
  },
)

it('preserves retained edits on stale proof and takes a fresh proof on independent reopen', async () => {
  let valid = true
  const first = await proof('release-1', () => {if (!valid) throw Error('PUBLICATION_STALE')})
  const next = await proof('release-2', () => {})
  const resolvePagePublication = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(next)
  const {pool, route, runtime} = await openTool({resolvePagePublication,
    loadScenario: async () => SparkData.createDataSet({dataSetName: 'Scene', scenarioId: 'SCENE', tables: {}}),
  })
  let reopened: typeof runtime | undefined
  try {
    await runtime.load()
    const original = runtime.getDataSet('SCENE')
    const draft = runtime.getContent('draft')
    draft.acceptRead('{}')
    draft.setDraft('{"title":"本地草稿"}')
    valid = false
    expect(() => pool.getPageRuntime(route)).toThrow('PUBLICATION_STALE')
    expect(() => pool.closePageRuntime(runtime.instanceId)).toThrow('未保存')
    expect(runtime.isDirty).toBe(true)
    expect(original?.destroyed).toBe(false)
    draft.discardDraft()
    pool.closePageRuntime(runtime.instanceId)
    expect(original?.destroyed).toBe(true)
    reopened = pool.getPageRuntime(route)
    if (!reopened) throw Error('缺少独立重开实例')
    await reopened.load()
    expect(reopened.instanceId).not.toBe(runtime.instanceId)
    expect(reopened.source.publicationRef).toBe('release-2')
    expect(reopened.getDataSet('SCENE')).not.toBe(original)
    expect(resolvePagePublication).toHaveBeenCalledTimes(2)
  } finally {
    reopened?.dispose()
    runtime.dispose()
  }
})

it('keeps the newer receipt when a replaced publication request finishes after reload', async () => {
  let oldCurrent = true
  const old = await proof('release-1', () => {if (!oldCurrent) throw Error('OLD_PUBLICATION_STALE')})
  const next = await proof('release-2', () => {})
  let release: (value: RuntimePageNavigationReceipt) => void = () => {}
  const pending = new Promise<RuntimePageNavigationReceipt>(resolve => {release = resolve})
  const resolvePageNavigationReceipt = vi.fn<NonNullable<PageRuntimePoolOptions['resolvePageNavigationReceipt']>>()
    .mockReturnValueOnce(pending)
    .mockResolvedValueOnce({state: 'READY', publication: next, files, assertCurrent: () => {}})
  const {pool, route, runtime} = await openTool({resolvePageNavigationReceipt,
    loadScenario: async () => SparkData.createDataSet({dataSetName: 'Scene', scenarioId: 'SCENE', tables: {}}),
  })
  try {
    const firstOpen = runtime.load()
    const replaced = expect(firstOpen).rejects.toThrow('STALE')
    await vi.waitFor(() => expect(resolvePageNavigationReceipt).toHaveBeenCalledOnce())
    await runtime.reload()
    const current = runtime.getDataSet('SCENE')
    release({state: 'READY', publication: old, files, assertCurrent: old.assertCurrent})
    await replaced
    oldCurrent = false
    expect(pool.getPageRuntime(route)).toBe(runtime)
    expect(runtime.source.publicationRef).toBe('release-2')
    expect(runtime.getDataSet('SCENE')).toBe(current)
    expect(current?.destroyed).toBe(false)
  } finally {
    release({state: 'READY', publication: old, files, assertCurrent: old.assertCurrent})
    runtime.dispose()
  }
})
