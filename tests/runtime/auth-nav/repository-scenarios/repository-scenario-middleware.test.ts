import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createServer as createViteServer, normalizePath, type HotUpdateOptions, type Plugin, type ViteDevServer} from 'vite'
import {afterEach, describe, expect, it} from 'vitest'
import {getBuiltinApplicationDescriptor, getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {repositoryScenarioPlugin} from '../../../../tools/vite-plugin-repository-scenarios'

const resource = {scenarioId: 'SCENE-1', resourceId: 'repository:scenario-view:SCENE-1', path: 'config/pages/scene/pagedata.json'}
const roots: string[] = []
const servers: ReturnType<typeof createServer>[] = []
const viteServers: ViteDevServer[] = []

describe('repository scenario Vite middleware', () => {
  it('serves fresh reads and accepts only an exact preimage write', async () => {
    const root = await fixtureRoot()
    const file = path.join(root, resource.path)
    await mkdir(path.dirname(file), {recursive: true})
    const before = JSON.stringify({scenarioId: resource.scenarioId, revision: 'before'})
    const after = JSON.stringify({scenarioId: resource.scenarioId, revision: 'after'})
    await writeFile(file, before)
    const base = await startPluginServer(repositoryScenarioPlugin({root, resources: [resource]}))

    const read = await fetch(`${base}/__spark/repository-scenarios?resourceId=${encodeURIComponent(resource.resourceId)}`)
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({resourceId: resource.resourceId, scenarioId: resource.scenarioId, text: before})

    const write = await fetch(`${base}/__spark/repository-scenarios`, {method: 'POST',
      headers: {'Content-Type': 'application/json', Origin: base},
      body: JSON.stringify({resourceId: resource.resourceId, text: after, expectedText: before})})
    const writeBody = await write.json()
    expect(write.status, JSON.stringify(writeBody)).toBe(200)
    expect(writeBody).toMatchObject({resourceId: resource.resourceId, scenarioId: resource.scenarioId, text: after})
    expect(await readFile(file, 'utf8')).toBe(after)

    const conflict = await fetch(`${base}/__spark/repository-scenarios`, {method: 'POST',
      headers: {'Content-Type': 'application/json', Origin: base},
      body: JSON.stringify({resourceId: resource.resourceId, text: JSON.stringify({scenarioId: resource.scenarioId}), expectedText: before})})
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({resourceId: resource.resourceId, outcome: 'not-applied',
      code: 'REPOSITORY_SCENARIO_CONFLICT'})
    expect(await readFile(file, 'utf8')).toBe(after)
  })

  it('lists, reads and exclusively creates numbered history files without changing the active file', async () => {
    const root = await fixtureRoot()
    const file = path.join(root, resource.path)
    await mkdir(path.dirname(file), {recursive: true})
    const before = JSON.stringify({scenarioId: resource.scenarioId, tables: {}, viewCascades: []})
    const snapshot = before
    await writeFile(file, before)
    const base = await startPluginServer(repositoryScenarioPlugin({root, resources: [resource]}))
    const endpoint = `${base}/__spark/repository-scenarios`
    const query = (params: Record<string, string>) => `${endpoint}?${new URLSearchParams({resourceId: resource.resourceId, ...params})}`

    const empty = await fetch(query({history: 'list'}))
    expect(empty.status).toBe(200)
    expect(await empty.json()).toMatchObject({resourceId: resource.resourceId, scenarioId: resource.scenarioId, versions: []})
    const created = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: base},
      body: JSON.stringify({operation: 'create-version', resourceId: resource.resourceId, version: 0, text: snapshot, expectedText: before})})
    expect(created.status).toBe(200)
    expect(await created.json()).toMatchObject({resourceId: resource.resourceId, scenarioId: resource.scenarioId,
      version: 0, fileName: '0__pagedata.json'})
    const versions = await fetch(query({history: 'list'}))
    expect(await versions.json()).toMatchObject({versions: [{version: 0, fileName: '0__pagedata.json'}]})
    const preview = await fetch(query({version: '0'}))
    expect(await preview.json()).toMatchObject({resourceId: resource.resourceId, scenarioId: resource.scenarioId,
      version: 0, fileName: '0__pagedata.json', text: snapshot})
    const collision = await fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: base},
      body: JSON.stringify({operation: 'create-version', resourceId: resource.resourceId, version: 0, text: before, expectedText: before})})
    expect(collision.status).toBe(409)
    expect(await collision.json()).toMatchObject({resourceId: resource.resourceId, version: 0, outcome: 'not-applied'})
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('rejects mismatched Origin and oversized JSON without touching the target', async () => {
    const root = await fixtureRoot()
    const file = path.join(root, resource.path)
    await mkdir(path.dirname(file), {recursive: true})
    await writeFile(file, 'before')
    const base = await startPluginServer(repositoryScenarioPlugin({root, resources: [resource]}))

    const wrongOrigin = await fetch(`${base}/__spark/repository-scenarios`, {method: 'POST',
      headers: {'Content-Type': 'application/json', Origin: 'http://localhost:1'},
      body: JSON.stringify({resourceId: resource.resourceId, text: 'after', expectedText: 'before'})})
    expect(wrongOrigin.status).toBe(403)
    expect(await wrongOrigin.json()).toMatchObject({resourceId: null, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_ORIGIN_INVALID'})

    const tooLarge = await fetch(`${base}/__spark/repository-scenarios`, {method: 'POST',
      headers: {'Content-Type': 'application/json', Origin: base},
      body: JSON.stringify({resourceId: resource.resourceId, text: 'x'.repeat(1024 * 1024), expectedText: 'before'})})
    expect(tooLarge.status).toBe(413)
    expect(await tooLarge.json()).toMatchObject({resourceId: null, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_BODY_TOO_LARGE'})
    expect(await readFile(file, 'utf8')).toBe('before')
  })

  it('rejects cross-site reads without Origin and malformed UTF-8 JSON before storage IO', async () => {
    const root = await fixtureRoot()
    const file = path.join(root, resource.path)
    await mkdir(path.dirname(file), {recursive: true})
    const before = JSON.stringify({scenarioId: resource.scenarioId})
    await writeFile(file, before)
    const base = await startPluginServer(repositoryScenarioPlugin({root, resources: [resource]}))

    const crossSite = await fetch(`${base}/__spark/repository-scenarios?resourceId=${encodeURIComponent(resource.resourceId)}`,
      {headers: {'Sec-Fetch-Site': 'cross-site'}})
    expect(crossSite.status).toBe(403)
    expect(await crossSite.json()).toMatchObject({code: 'REPOSITORY_SCENARIO_ORIGIN_INVALID', outcome: 'not-applied'})

    const invalidUtf8 = await fetch(`${base}/__spark/repository-scenarios`, {method: 'POST',
      headers: {'Content-Type': 'application/json', Origin: base}, body: new Uint8Array([0x7b, 0x22, 0xff, 0x7d])})
    expect(invalidUtf8.status).toBe(400)
    expect(await invalidUtf8.json()).toMatchObject({code: 'REPOSITORY_SCENARIO_JSON_INVALID', outcome: 'not-applied'})
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('rejects wildcard listeners, spoofed Host headers and nonloopback peers', async () => {
    const root = await fixtureRoot()
    const file = path.join(root, resource.path)
    await mkdir(path.dirname(file), {recursive: true})
    await writeFile(file, JSON.stringify({scenarioId: resource.scenarioId}))
    const plugin = repositoryScenarioPlugin({root, resources: [resource]})

    const wildcard = await startPluginServer(plugin, '0.0.0.0')
    const wildcardResponse = await fetch(`${wildcard}/__spark/repository-scenarios?resourceId=${encodeURIComponent(resource.resourceId)}`)
    expect(wildcardResponse.status).toBe(403)
    expect(await wildcardResponse.json()).toMatchObject({code: 'REPOSITORY_SCENARIO_LOOPBACK_REQUIRED'})

    const loopback = await startPluginServer(plugin, '127.0.0.1', request => {
      request.headers.host = `spoof.invalid:${request.socket.localPort}`
    })
    const spoofed = await fetch(`${loopback}/__spark/repository-scenarios?resourceId=${encodeURIComponent(resource.resourceId)}`)
    expect(spoofed.status).toBe(403)
    expect(await spoofed.json()).toMatchObject({code: 'REPOSITORY_SCENARIO_HOST_INVALID'})

    const remotePeer = await startPluginServer(plugin, '127.0.0.1', request => {
      Object.defineProperty(request.socket, 'remoteAddress', {configurable: true, value: '192.0.2.10'})
    })
    const remoteResponse = await fetch(`${remotePeer}/__spark/repository-scenarios?resourceId=${encodeURIComponent(resource.resourceId)}`)
    expect(remoteResponse.status).toBe(403)
    expect(await remoteResponse.json()).toMatchObject({code: 'REPOSITORY_SCENARIO_LOOPBACK_REQUIRED'})
  })

  it('is registered only for the Vite dev server, not build or preview', () => {
    const plugin = repositoryScenarioPlugin({root: process.cwd(), resources: [resource]})
    expect(plugin.apply).toBe('serve')
    expect(plugin.configureServer).toBeTypeOf('function')
    expect(plugin.configurePreviewServer).toBeUndefined()
  })

  it('filters registered scenario HMR after the real import-glob hook for create, update and delete', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.repository-scenario-hmr-'))
    roots.push(root)
    const resources = (['dataSpaceDesign', 'dataSpaceCatalog', 'dataDictionary', 'projectBlueprint'] as const)
      .map(name => getBuiltinScenarioResource(name))
    const plugin = repositoryScenarioPlugin({root, resources})
    const importerPath = path.join(root, 'src', 'glob-fixture.ts')
    await mkdir(path.dirname(importerPath), {recursive: true})
    await writeFile(importerPath, [
      "export const pages = import.meta.glob('../config/pages/**/*.json', {query: '?raw', import: 'default'})",
      "export const navigation = import.meta.glob('../config/navigation/*.json', {query: '?raw', import: 'default'})",
    ].join('\n'))
    for (const resource of resources) {
      const file = path.join(root, resource.path)
      await mkdir(path.dirname(file), {recursive: true})
      await writeFile(file, JSON.stringify({scenarioId: resource.scenarioId}))
    }
    const navigationPath = path.join(root, getBuiltinApplicationDescriptor().navigation.path)
    await mkdir(path.dirname(navigationPath), {recursive: true})
    await writeFile(navigationPath, '[]')
    const server = await createViteServer({configFile: false, root, plugins: [plugin], logLevel: 'silent', server: {watch: null}})
    viteServers.push(server)
    const context = server.environments.client.pluginContainer.minimalContext
    await server.transformRequest('/src/glob-fixture.ts')
    const relevantPlugins = server.environments.client.plugins.filter(candidate =>
      candidate.name === plugin.name || candidate.name === 'vite:import-glob')
    const repositoryPlugin = relevantPlugins.find(candidate => candidate.name === plugin.name)
    const importGlobPlugin = relevantPlugins.find(candidate => candidate.name === 'vite:import-glob')
    if (!repositoryPlugin || !importGlobPlugin || relevantPlugins.length !== 2) throw new Error('Vite HMR hook chain is incomplete')
    expect(relevantPlugins[0]?.name).toBe(plugin.name)
    const repositoryHook = repositoryPlugin.hotUpdate
    const importGlobHook = importGlobPlugin.hotUpdate
    if (!repositoryHook || !importGlobHook) throw new Error('Vite HMR hook is missing')
    const order = (hook: NonNullable<Plugin['hotUpdate']>): string =>
      typeof hook === 'function' ? 'normal' : hook.order ?? 'normal'
    const hooks = relevantPlugins.map(candidate => ({plugin: candidate, hook: candidate.hotUpdate}))
      .filter((entry): entry is {plugin: Plugin; hook: NonNullable<Plugin['hotUpdate']>} => entry.hook !== undefined)
      .sort((left, right) => rank(order(left.hook)) - rank(order(right.hook)))
    const invoke = async (hook: NonNullable<Plugin['hotUpdate']>, options: HotUpdateOptions) => {
      if (typeof hook === 'function') return hook.call(context, options)
      return hook.handler.call(context, options)
    }
    const runChain = async (type: HotUpdateOptions['type'], file: string) => {
      let modules = type === 'update' ? [...(server.environments.client.moduleGraph.getModulesByFile(file) ?? [])] : []
      const options = {type, file, timestamp: 1, modules, read: () => '', server} satisfies HotUpdateOptions
      for (const entry of hooks) {
        const updated = await invoke(entry.hook, {...options, modules})
        if (updated !== undefined) modules = updated
      }
      return modules
    }

    for (const resource of resources) {
      const registeredPath = path.resolve(root, resource.path)
      const normalizedPath = normalizePath(registeredPath)
      const slashPath = registeredPath.replaceAll('\\', '/')
      const otherDirectory = normalizePath(path.resolve(root, 'same-name-elsewhere', resource.path))
      const originalModules = [...(server.environments.client.moduleGraph.getModulesByFile(normalizedPath) ?? [])]
      expect(originalModules.some(module => module.id?.includes('?raw') === true)).toBe(true)
      for (const type of ['create', 'update', 'delete'] as const) {
        if (type !== 'update') {
          const globResult = await invoke(importGlobHook, {type, file: normalizedPath, timestamp: 1,
            modules: [], read: () => '', server})
          expect(globResult?.map(module => module.file)).toContain(normalizePath(importerPath))
        }
        expect(await runChain(type, normalizedPath)).toEqual([])
      }
      const hookOptions = {type: 'update' as const, file: slashPath, timestamp: 1, modules: [], read: () => '', server}
      const repositoryResult = await invoke(repositoryHook, hookOptions)
      expect(repositoryResult).toEqual([])
      expect(await invoke(repositoryHook, {...hookOptions, file: otherDirectory})).toBeUndefined()
    }

    const navigationAbsolutePath = path.resolve(root, getBuiltinApplicationDescriptor().navigation.path)
    const otherSourcePath = path.resolve(root, 'src/lowcode/lowcode-runtime.ts')
    const unchangedOptions = {type: 'update' as const, timestamp: 1, modules: [], read: () => '', server}
    expect(await invoke(repositoryHook, {...unchangedOptions, file: navigationAbsolutePath})).toBeUndefined()
    expect(await invoke(repositoryHook, {...unchangedOptions, file: otherSourcePath})).toBeUndefined()
  })
})

afterEach(async () => {
  await Promise.all(viteServers.splice(0).map(server => server.close()))
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(roots.splice(0).map(root => rm(root, {recursive: true, force: true})))
})

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'spark-repository-middleware-'))
  roots.push(root)
  return root
}

function rank(order: string): number {
  if (order === 'pre') return 0
  if (order === 'post') return 2
  return 1
}

async function startPluginServer(plugin: Plugin, host = '127.0.0.1', beforePlugins?: (request: IncomingMessage) => void): Promise<string> {
  const handlers: Array<(req: IncomingMessage, res: ServerResponse, next: () => void) => void> = []
  const httpServer = createServer((request, response) => {
    beforePlugins?.(request)
    let index = 0
    const next = (): void => {
      const handler = handlers[index++]
      if (handler) handler(request, response, next)
      else {response.statusCode = 404; response.end()}
    }
    next()
  })
  servers.push(httpServer)
  const server = {httpServer, middlewares: {use: (handler: typeof handlers[number]) => handlers.push(handler)}} as unknown as ViteDevServer
  const configure = plugin.configureServer as ((server: ViteDevServer) => void) | undefined
  if (typeof configure === 'function') configure(server)
  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(0, host, () => {httpServer.off('error', reject); resolve()})
  })
  const address = httpServer.address()
  if (!address || typeof address === 'string') throw new Error('test server did not bind to TCP')
  return `http://127.0.0.1:${address.port}`
}
