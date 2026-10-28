import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase, Request } from '@spark-appworks/spark-utils'
import {
  DataSpaceDesignApi, DataSpaceRuntimeApi,
} from '@spark-appworks/spark-lowcode-api'
import { DataSet, DataViewFilter, RequestState } from '@spark-appworks/spark-data'
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import {readFileSync} from 'node:fs'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'

const transport = { request: vi.fn() }
const originalTransport = Object.getOwnPropertyDescriptor(Request.prototype, 'executeRequest')
let runtime: typeof import('../../../src/lowcode/lowcode-runtime')

import { ScenarioViewConfig } from '../../../packages/spark-project-model/src/scenario/scenario-view-config'
import { LowcodeDataSpaceAssembler, type LowcodeDataSpaceAssemblerInput } from '../../../src/lowcode/data-space/lowcode-data-space-assembler'
import { LowcodeDataSpaceViewFields } from '../../../src/lowcode/data-space/view-design/lowcode-data-space-view-fields'
import {getBuiltinApplicationDescriptor, getBuiltinScenarioResource} from '../../../src/registries/builtin-application-registry'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sceneWorkspace(applicationId = 'APP-1'): ProjectWorkspace {
  const { lowcodeApi, createLowcodeProjectGateways } = runtime
  lowcodeApi.session.save({ accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
    accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 120_000,
    identity: { userId: 'USER-1', account: 'fixture', displayName: 'fixture', enterpriseId: 'TENANT-1',
      enterpriseShortName: 'fixture-tenant', role: null, raw: {} },
    enterprise: { id: 'TENANT-1', name: 'fixture', code: 'fixture', shortName: 'fixture-tenant', shortCode: 'fixture', raw: {} },
  })
  lowcodeApi.application.save({ application: { id: applicationId, code: 'APP-CODE', name: 'fixture', description: '',
    enterpriseId: 'OWNER-1', enterpriseShortName: 'owner', isDefault: false }, navigationRootId: 'NAV-ROOT' })
  return new ProjectWorkspace({ projectId: applicationId, ...createLowcodeProjectGateways(applicationId) })
}

async function stubRepositoryScenarioHost(resource: Readonly<{resourceId: string; scenarioId: string}>, text: string) {
  vi.stubEnv('DEV', true)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const sourceRevision = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const post = init?.method === 'POST'
    const payload = post
      ? {resourceId: resource.resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_CONFLICT', message: 'fixture rejection'}
      : {resourceId: resource.resourceId, scenarioId: resource.scenarioId, text, sourceRevision}
    return new Response(JSON.stringify(payload), {status: post ? 409 : 200, headers: {'Content-Type': 'application/json'}})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('host scenario file request wiring', () => {
  beforeAll(async () => {
    if (!originalTransport) throw new Error('missing Request transport')
    Object.defineProperty(Request.prototype, 'executeRequest', {
      ...originalTransport,
      value: async (config: RequestConfig) => {
        const response: unknown = await transport.request(config)
        return response
      },
    })
    runtime = await import('../../../src/lowcode/lowcode-runtime')
  })

  it('reads tool snapshot text with fatal UTF-8 decoding while preserving a BOM', async () => {
    sceneWorkspace()
    const io=runtime.createPageToolFilesIo('APP-1'),source='\uFEFFconst value = "历史";\r\n'
    const encoded=new TextEncoder().encode(source),buffer=new ArrayBuffer(encoded.length);new Uint8Array(buffer).set(encoded)
    transport.request.mockResolvedValue({data:buffer,status:200,statusText:'OK',headers:{}})
    await expect(io.readVersion({appId:'APP-1',customPath:'APP-1/orders',fileName:'script.js',version:0})).resolves.toBe(source)
    expect(transport.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      url:'/api/File/DownFile',data:expect.objectContaining({customPath:'APP-1/orders',fileName:'0__script.js'}),responseType:'arraybuffer',
    }))
  })

  it('rejects a tool snapshot with invalid UTF-8 bytes', async () => {
    sceneWorkspace()
    const io=runtime.createPageToolFilesIo('APP-1'),buffer=new Uint8Array([0xc3,0x28]).buffer
    transport.request.mockResolvedValue({data:buffer,status:200,statusText:'OK',headers:{}})
    await expect(io.readVersion({appId:'APP-1',customPath:'APP-1/orders',fileName:'script.js',version:1})).rejects.toThrow()
  })

  it('replaces an existing tool working file on restore while keeping version uploads non-replacing', async () => {
    sceneWorkspace()
    const io=runtime.createPageToolFilesIo('APP-1') as ReturnType<typeof runtime.createPageToolFilesIo> & {
      restoreWorkingFile:(command:{appId:string;pageId:string;fileName:'script.js';text:string})=>Promise<void>
    }
    const contents=new Map([['script.js','existing working text']])
    const toBuffer=(text:string):ArrayBuffer=>{const bytes=new TextEncoder().encode(text),buffer=new ArrayBuffer(bytes.length);new Uint8Array(buffer).set(bytes);return buffer}
    transport.request.mockImplementation(async(config:RequestConfig)=>{
      if(config.url==='/api/File/UploadFile'){
        const form=config.data as FormData,fileName=String(form.get('newName')),file=form.get('file')
        if(!(file instanceof Blob))throw new Error('expected multipart file')
        const text=new TextDecoder().decode(await file.arrayBuffer()),replace=form.get('isReplace')==='true'
        if(contents.has(fileName)&&!replace)return {data:{Code:200,Result:[{state:'success',filePath:`/APP-1/orders/${fileName} (1)`}]},status:200,statusText:'OK',headers:{}}
        contents.set(fileName,text)
        return {data:{Code:200,Result:[{state:'success',filePath:`/APP-1/orders/${fileName}`}]},status:200,statusText:'OK',headers:{}}
      }
      if(config.url==='/api/File/DownFile'){
        const fileName=String((config.data as Record<string,unknown>)['fileName'])
        return {data:toBuffer(contents.get(fileName)??''),status:200,statusText:'OK',headers:{}}
      }
      throw new Error(`unexpected request: ${config.url}`)
    })

    await io.restoreWorkingFile({appId:'APP-1',pageId:'orders',fileName:'script.js',text:'restored text'})
    const restoreUpload=transport.request.mock.calls[0]?.[0]
    const restoreForm=restoreUpload?.data as FormData
    expect(restoreUpload?.url).toBe('/api/File/UploadFile')
    expect(restoreForm.get('customPath')).toBe('APP-1/orders')
    expect(restoreForm.get('newName')).toBe('script.js')
    expect(restoreForm.get('isReplace')).toBe('true')
    expect(transport.request.mock.calls[1]?.[0].url).toBe('/api/File/DownFile')
    expect(contents.get('script.js')).toBe('restored text')

    await io.uploadVersion({appId:'APP-1',customPath:'APP-1/orders',fileName:'script.js',version:5,text:'snapshot text'})
    const versionForm=transport.request.mock.calls[2]?.[0].data as FormData
    expect(versionForm.get('customPath')).toBe('APP-1/orders')
    expect(versionForm.get('newName')).toBe('5__script.js')
    expect(versionForm.get('isReplace')).toBe('false')
  })
  afterAll(() => {
    if (originalTransport) Object.defineProperty(Request.prototype, 'executeRequest', originalTransport)
  })
  afterEach(() => {
    transport.request.mockReset()
    runtime.lowcodeApi.application.clear()
    runtime.lowcodeApi.session.clear()
    vi.unstubAllEnvs(); vi.unstubAllGlobals()
  })

  it('reports only an actual backend 404 as a missing shared scene file', async () => {
    sceneWorkspace()
    const gateway = runtime.createLowcodeProjectGateways('APP-1').scenarioViews
    transport.request.mockResolvedValue({ data: { Code: 404, Msg: '文件不存在', Result: null }, status: 200, statusText: 'OK', headers: {} })
    await expect(gateway.readText('SCENE-1')).resolves.toBeNull()
    for (const code of [403, 500]) {
      transport.request.mockResolvedValue({ data: { Code: code, Msg: '读取失败', Result: null }, status: 200, statusText: 'OK', headers: {} })
      await expect(gateway.readText('SCENE-1')).rejects.toMatchObject({ code })
    }
  })

  it.each(['', '.', '..', 'parent/scene', 'parent\\scene'])('rejects invalid scene paths %j before transport', async scenarioId => {
    const workspace = sceneWorkspace()
    await expect(workspace.loadScenarioViews({ scenarioId })).rejects.toThrow()
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('requires an explicitly selected application before reading scene files', async () => {
    const workspace = sceneWorkspace()
    runtime.lowcodeApi.application.clear()
    await expect(workspace.loadScenarioViews({ scenarioId: 'SCENE-1' })).rejects.toThrow('明确选中应用')
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('does not expose an ungoverned page-file version delete gateway', () => {
    sceneWorkspace()
    const gateway = runtime.createLowcodeProjectGateways('APP-1').pageFiles
    expect('deleteVersion' in gateway).toBe(false)
  })

  it('does not expose raw blueprint loading while retaining project-reference projection', () => {
    sceneWorkspace()
    const gateways = runtime.createLowcodeProjectGateways('APP-1')
    expect('loadRoot' in gateways.blueprint).toBe(false)
    expect(gateways.projectReferences.loadProjectBlueprint).toBeTypeOf('function')
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('rejects scene reads and writes from a workspace belonging to another application', async () => {
    sceneWorkspace('APP-2')
    const gateway = runtime.createLowcodeProjectGateways('APP-1').scenarioViews
    await expect(gateway.readText('SCENE-1')).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    if (!gateway.writeText) throw new Error('missing scene write gateway')
    await expect(gateway.writeText('SCENE-1', '{}')).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('loads the same scenario from separate application folders', async () => {
    const source = { scenarioId: 'SCENE-1', tables: {}, viewCascades: [] }
    const texts = new Map([
      ['APP-1/SysForm/SCENE-1', JSON.stringify(source)],
      ['APP-2/SysForm/SCENE-1', JSON.stringify(source, null, 2)],
    ])
    transport.request.mockImplementation(async (config: RequestConfig) => {
      if (!isRecord(config.data) || typeof config.data['customPath'] !== 'string') throw new Error('missing path')
      const text = texts.get(config.data['customPath'])
      if (text === undefined) throw new Error('unexpected application folder')
      return { data: { Code: 200, Result: text }, status: 200, statusText: 'OK', headers: {} }
    })
    const first = await sceneWorkspace('APP-1').loadScenarioViews({ scenarioId: 'SCENE-1' })
    const second = await sceneWorkspace('APP-2').loadScenarioViews({ scenarioId: 'SCENE-1' })
    expect(first.getText()).toBe(texts.get('APP-1/SysForm/SCENE-1'))
    expect(second.getText()).toBe(texts.get('APP-2/SysForm/SCENE-1'))
    expect(first).not.toBe(second)
  })

  it.each([200, 404])('rejects a late scene response %i after switching applications', async code => {
    const workspace = sceneWorkspace()
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const dispatched = new Promise<void>(resolve => { started = resolve })
    transport.request.mockImplementation(async () => {
      started?.()
      await gate
      return { data: { Code: code, Msg: code === 404 ? '文件不存在' : '', Result: JSON.stringify({ scenarioId: 'SCENE-1', tables: {}, viewCascades: [] }) },
        status: 200, statusText: 'OK', headers: {} }
    })
    const pending = workspace.loadScenarioViews({ scenarioId: 'SCENE-1' })
    const rejected = expect(pending).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    await dispatched
    const context = runtime.lowcodeApi.application.get()
    if (!context) throw new Error('missing fixture application')
    runtime.lowcodeApi.application.save({ ...context, application: { ...context.application, id: 'APP-2' } })
    release?.()
    await rejected
    expect(workspace.getScenarioViews('SCENE-1')).toBeNull()
  })

  it('loads and saves the scene file with the selected appId through the existing request layer', async () => {
    const workspace = sceneWorkspace()
    let text = JSON.stringify({ scenarioId: 'SCENE-1', tables: {}, viewCascades: [] })
    const requests: RequestConfig[] = []
    transport.request.mockImplementation(async (config: RequestConfig) => {
      requests.push(config)
      let data: unknown = { Code: 200, Result: text }
      if (config.url === '/api/File/UploadFile') {
        if (!(config.data instanceof FormData)) throw new Error('expected multipart')
        const file = config.data.get('file')
        if (!(file instanceof Blob)) throw new Error('expected file')
        text = new TextDecoder().decode(await file.arrayBuffer())
        data = { Code: 200, Result: [{ state: 'success' }] }
      } else if (config.url === '/api/File/DownFile') {
        const bytes = new TextEncoder().encode(text)
        const buffer = new ArrayBuffer(bytes.length)
        new Uint8Array(buffer).set(bytes)
        data = buffer
      }
      return { data, status: 200, statusText: 'OK', headers: {} }
    })
    const file = await workspace.loadScenarioViews({ scenarioId: 'SCENE-1' })
    file.setText(JSON.stringify({ scenarioId: 'SCENE-1', tables: {}, viewCascades: [] }, null, 2))
    await workspace.saveScenarioViews({ scenarioId: 'SCENE-1' })
    expect(file.isDirty).toBe(false)
    expect(requests.map(config => config.url)).toEqual([
      '/api/File/content/text', '/api/File/content/text', '/api/File/UploadFile', '/api/File/DownFile', '/api/File/content/text',
    ])
    for (const config of requests) {
      expect(config.headers).toMatchObject({ 'X-AppId': 'APP-1', 'tenant-id': 'fixture-tenant', Authorization: 'Bearer fixture-access' })
      if (config.data instanceof FormData) {
        expect(config.data.get('customPath')).toBe('APP-1/SysForm/SCENE-1')
        expect(config.data.get('newName')).toBe('pagedata.json')
        expect(config.data.has('applicationId')).toBe(false)
      } else {
        expect(config.data).toMatchObject({ appType: 'designfile', customPath: 'APP-1/SysForm/SCENE-1', fileName: 'pagedata.json' })
        expect(config.data).not.toHaveProperty('applicationId')
      }
    }
  })

  it.each([
    { fileName: 'rule.json' as const, versionId: undefined, expected: 'rule.json' },
    { fileName: 'rule.json' as const, versionId: '2', expected: '2__rule.json' },
    { fileName: 'rule.json' as const, versionId: 'style=3;rule=2;script=1', expected: '2__rule.json' },
    { fileName: 'script.js' as const, versionId: 'style=3;rule=2;script=1', expected: '1__script.js' },
    { fileName: 'style.css' as const, versionId: 'style=3;rule=2;script=1', expected: '3__style.css' },
  ])('reads the exact tool file through the production gateway: $expected', async ({ fileName, versionId, expected }) => {
    const workspace = sceneWorkspace()
    transport.request.mockImplementation(async (config: RequestConfig) => ({
      data: { Code: 200, Result: isRecord(config.data) ? config.data['fileName'] : null },
      status: 200, statusText: 'OK', headers: {},
    }))
    await expect(workspace.previewPageFileRemote('orders', fileName, versionId)).resolves.toBe(expected)
    expect(transport.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      url: '/api/File/content/text',
      data: expect.objectContaining({ appType: 'designfile', customPath: 'APP-1/orders', fileName: expected }),
    }))
  })

  it.each(['', ' ', 'style=3', 'rule=1;rule=2', 'rule=-1', 'v1'])(
    'rejects an invalid or incomplete published tool pointer before transport: %j', async versionId => {
      const workspace = sceneWorkspace()
      await expect(workspace.previewPageFileRemote('orders', 'rule.json', versionId)).rejects.toThrow()
      expect(transport.request).not.toHaveBeenCalled()
    },
  )

  it('does not fall back to the working tool file when a published snapshot is missing', async () => {
    const workspace = sceneWorkspace()
    transport.request.mockResolvedValue({
      data: { Code: 404, Msg: '文件不存在', Result: null }, status: 200, statusText: 'OK', headers: {},
    })
    await expect(workspace.previewPageFileRemote('orders', 'script.js', 'script=4')).rejects.toMatchObject({ code: 404 })
    expect(transport.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      data: expect.objectContaining({ appType: 'designfile', customPath: 'APP-1/orders', fileName: '4__script.js' }),
    }))
  })

  it('rejects tool file reads and writes from another application before transport', async () => {
    sceneWorkspace('APP-2')
    const gateway = runtime.createLowcodeProjectGateways('APP-1').pageFiles
    if (!gateway.saveFileContent) throw new Error('missing tool file gateway')
    await expect(gateway.readPageFile({ projectId: 'APP-1', pageId: 'orders', fileName: 'script.js' }))
      .rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    await expect(gateway.saveFileContent('orders', 'script.js', 'changed')).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('does not expose direct working-file save for an unsaved editor draft', async () => {
    const workspace = sceneWorkspace()
    const page = workspace.project.openPageDesign('orders')
    workspace.project.setActivePage('orders')
    page.setFileText('script.js', 'submitted')
    expect('savePageFile' in workspace).toBe(false)
    expect(page.script.isDirty).toBe(true)
    expect(page.script.text).toBe('submitted')
  })

  it('snapshots and previews shared scene files with a fresh definition guard before upload', async () => {
    sceneWorkspace()
    const current = JSON.stringify({ scenarioId: 'SCENE-1', tables: {} })
    const previous = JSON.stringify({ scenarioId: 'SCENE-1', tables: {}, viewCascades: [] }, null, 2)
    const files = new Map([['pagedata.json', current], ['0__pagedata.json', previous], ['8__script.js', 'unrelated']])
    const gateway = runtime.createLowcodeProjectGateways('APP-1').scenarioViews
    if (!gateway.listVersions || !gateway.createVersion || !gateway.readVersion) throw new Error('missing scene version gateway')
    transport.request.mockImplementation(async (config: RequestConfig) => {
      let data: unknown
      if (config.url === '/api/File/list') {
        expect(config.data).toMatchObject({folderPath:'APP-1/SysForm/SCENE-1'})
        data = {Code:200,Result:[...files.keys()].map(name=>({name,lastModified:100}))}
      } else if (config.data instanceof FormData) {
        const name=config.data.get('newName'), file=config.data.get('file')
        if(typeof name !== 'string' || !(file instanceof Blob))throw new Error('invalid multipart')
        expect(config.data.get('customPath')).toBe('APP-1/SysForm/SCENE-1')
        expect(config.data.get('isReplace')).toBe(name === 'pagedata.json' ? 'true' : 'false')
        files.set(name,new TextDecoder('utf-8',{ignoreBOM:true}).decode(await file.arrayBuffer()))
        data={Code:200,Result:[{state:'success',filePath:`APP-1/SysForm/SCENE-1/${name}`}]}
      } else {
        if(!isRecord(config.data)||typeof config.data['fileName'] !== 'string')throw new Error('invalid file read')
        expect(config.data['customPath']).toBe('APP-1/SysForm/SCENE-1')
        const text=files.get(config.data['fileName']);if(text===undefined)throw new Error('missing file')
        if(config.url === '/api/File/DownFile'){const bytes=new TextEncoder().encode(text);const buffer=new ArrayBuffer(bytes.length);new Uint8Array(buffer).set(bytes);data=buffer}else data={Code:200,Result:text}
      }
      return {data,status:200,statusText:'OK',headers:{}}
    })
    expect(await gateway.listVersions('SCENE-1')).toEqual([{version:0,fileName:'0__pagedata.json',lastModified:100}])
    expect(await gateway.createVersion('SCENE-1',current)).toEqual({version:1,fileName:'1__pagedata.json',lastModified:100})
    expect(await gateway.readVersion('SCENE-1',0)).toBe(previous)
    expect('restoreVersion' in gateway).toBe(false)
    expect(files.get('pagedata.json')).toBe(current)
    expect(files.get('0__pagedata.json')).toBe(previous)
    expect(files.get('1__pagedata.json')).toBe(current)
    expect(transport.request.mock.calls.every(([config])=>config.url.startsWith('/api/File/'))).toBe(true)
    let guards = 0
    await expect(gateway.createVersion('SCENE-1',current,()=>{if (++guards > 1) throw new Error('DEFINITION_CHANGED')})).rejects.toThrow('DEFINITION_CHANGED')
    expect(files.has('2__pagedata.json')).toBe(false)
  })

  it('rejects unsafe scene versions and foreign application history before transport', async () => {
    sceneWorkspace()
    const gateway = runtime.createLowcodeProjectGateways('APP-1').scenarioViews
    if(!gateway.readVersion || !gateway.listVersions)throw new Error('missing scene version gateway')
    for(const version of [-1, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(gateway.readVersion('SCENE-1',version)).rejects.toThrow('非负安全整数')
    }
    sceneWorkspace('APP-2')
    await expect(gateway.listVersions('SCENE-1')).rejects.toThrow('SCOPE_STALE')
    expect(transport.request).not.toHaveBeenCalled()
  })


  it('rejects conflicting scene working content before snapshot upload', async () => {
    sceneWorkspace()
    const gateway=runtime.createLowcodeProjectGateways('APP-1').scenarioViews
    if(!gateway.createVersion)throw new Error('missing scene snapshot')
    transport.request.mockImplementation(async(config:RequestConfig)=>({data:{Code:200,Result:config.url === '/api/File/list'?[]:'changed remotely'},status:200,statusText:'OK',headers:{}}))
    await expect(gateway.createVersion('SCENE-1',JSON.stringify({scenarioId:'SCENE-1',tables:{}}))).rejects.toThrow('CONFLICT')
    expect(transport.request.mock.calls.some(([config])=>config.url === '/api/File/UploadFile')).toBe(false)
  })

  it('does not expose direct page-file version list or create gateways', async () => {
    sceneWorkspace()
    const gateway = runtime.createLowcodeProjectGateways('APP-1').pageFiles
    expect('listVersions' in gateway).toBe(false)
    expect('createVersion' in gateway).toBe(false)
    expect(transport.request).not.toHaveBeenCalled()
  })

  it.each(['..', '../orders', 'parent\\orders'])(
    'rejects invalid tool paths %j before transport', async pageId => {
      sceneWorkspace()
      const gateway = runtime.createLowcodeProjectGateways('APP-1').pageFiles
      if (!gateway.saveFileContent) throw new Error('missing tool gateway')
      await expect(gateway.saveFileContent(pageId, 'script.js', 'text')).rejects.toThrow('合法路径段')
      expect(transport.request).not.toHaveBeenCalled()
    },
  )

  it('refuses the retired page-local pagedata write path', async () => {
    sceneWorkspace()
    const gateway = runtime.createLowcodeProjectGateways('APP-1').pageFiles
    if (!gateway.saveFileContent) throw new Error('missing tool gateway')
    await expect(Reflect.apply(gateway.saveFileContent, gateway, ['orders', 'pagedata.json', '{}'])).rejects.toThrow('场景文件')
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('blocks remote scenario write and history only for the four repository program scenes', async () => {
    const applicationId = getBuiltinApplicationDescriptor().id
    sceneWorkspace(applicationId)
    const gateway = runtime.createLowcodeProjectGateways(applicationId).scenarioViews
    const programSceneId = getBuiltinScenarioResource('dataSpaceCatalog').scenarioId
    if (!gateway.writeText || !gateway.listVersions || !gateway.readVersion || !gateway.createVersion) {
      throw new Error('missing scenario write/history gateway')
    }
    const resource = getBuiltinScenarioResource('dataSpaceCatalog'), baseline = readFileSync(resource.path, 'utf8')
    const host = await stubRepositoryScenarioHost(resource, baseline)
    await expect(gateway.writeText(programSceneId, '{}', baseline)).rejects.toMatchObject({
      name: 'ScenarioViewWriteNotAppliedError', resourceId: resource.resourceId,
    })
    await expect(gateway.listVersions(programSceneId)).rejects.toThrow('BUILTIN_SCENARIO_HISTORY_UNAVAILABLE')
    await expect(gateway.readVersion(programSceneId, 0)).rejects.toThrow('BUILTIN_SCENARIO_HISTORY_UNAVAILABLE')
    await expect(gateway.createVersion(programSceneId, '{}')).rejects.toThrow('BUILTIN_SCENARIO_HISTORY_UNAVAILABLE')
    expect(transport.request).not.toHaveBeenCalled()
    expect(host).toHaveBeenCalledOnce()

    const targetScenarioId = 'A'.repeat(32)
    const upload = vi.spyOn(runtime.lowcodeDesignFileUpload, 'uploadWorkingText').mockResolvedValue({state: 'success'})
    transport.request.mockResolvedValue({data: {Code: 200, Result: []}, status: 200, statusText: 'OK', headers: {}})
    await gateway.writeText(targetScenarioId, JSON.stringify({scenarioId: targetScenarioId, tables: {}}))
    await expect(gateway.listVersions(targetScenarioId)).resolves.toEqual([])
    expect(upload).toHaveBeenCalledOnce()
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({customPath: `${applicationId}/SysForm/${targetScenarioId}`}))
    expect(transport.request).toHaveBeenCalled()
  })

  it('keeps registered system scenes on their repository source when a dynamic app executes them', async () => {
    const resource = getBuiltinScenarioResource('dataSpaceCatalog')
    sceneWorkspace('DYNAMIC-APP')
    const gateway = runtime.createLowcodeProjectGateways('DYNAMIC-APP').scenarioViews
    if (!gateway.writeText || !gateway.listVersions || !gateway.readVersion || !gateway.createVersion) {
      throw new Error('missing scenario write/history gateway')
    }

    const text = readFileSync(resource.path, 'utf8')
    const host = await stubRepositoryScenarioHost(resource, text)
    await expect(gateway.readText(resource.scenarioId)).resolves.toBe(text)
    if (text === null) throw new Error('registered system scenario unexpectedly missing')
    expect(text).toContain(`"scenarioId": "${resource.scenarioId}"`)
    expect(transport.request).not.toHaveBeenCalled()
    await expect(gateway.writeText(resource.scenarioId, text, text)).rejects.toMatchObject({
      name: 'ScenarioViewWriteNotAppliedError', resourceId: resource.resourceId,
    })
    await expect(gateway.listVersions(resource.scenarioId)).rejects.toThrow('BUILTIN_SCENARIO_HISTORY_UNAVAILABLE')
    await expect(gateway.readVersion(resource.scenarioId, 0)).rejects.toThrow('BUILTIN_SCENARIO_HISTORY_UNAVAILABLE')
    await expect(gateway.createVersion(resource.scenarioId, text)).rejects.toThrow('BUILTIN_SCENARIO_HISTORY_UNAVAILABLE')

    const paddedScenarioId = ` ${resource.scenarioId} `
    await expect(gateway.readText(paddedScenarioId)).resolves.toBe(text)
    await expect(gateway.writeText(paddedScenarioId, text, text)).rejects.toMatchObject({
      name: 'ScenarioViewWriteNotAppliedError', resourceId: resource.resourceId,
    })
    await expect(gateway.listVersions(paddedScenarioId)).rejects.toThrow('BUILTIN_SCENARIO_HISTORY_UNAVAILABLE')
    await expect(gateway.readVersion(paddedScenarioId, 0)).rejects.toThrow('BUILTIN_SCENARIO_HISTORY_UNAVAILABLE')
    await expect(gateway.createVersion(paddedScenarioId, text)).rejects.toThrow('BUILTIN_SCENARIO_HISTORY_UNAVAILABLE')
    expect(transport.request).not.toHaveBeenCalled()
    expect(host).toHaveBeenCalledTimes(4)
    const post = host.mock.calls.find(([, init]) => init?.method === 'POST')
    if (!post?.[1]?.body || typeof post[1].body !== 'string') throw new Error('missing repository POST body')
    expect(JSON.parse(post[1].body)).toEqual({resourceId: resource.resourceId, text, expectedText: text})
  })

  it.each(['switch', 'logout'] as const)('rejects a stale registered-scene gateway before POST after %s', async transition => {
    const applicationId = getBuiltinApplicationDescriptor().id
    sceneWorkspace(applicationId)
    const gateway = runtime.createLowcodeProjectGateways(applicationId).scenarioViews
    const resource = getBuiltinScenarioResource('dataSpaceCatalog')
    const text = readFileSync(resource.path, 'utf8')
    const host = await stubRepositoryScenarioHost(resource, text)
    if (!gateway.writeText) throw new Error('missing scenario write gateway')
    if (transition === 'switch') sceneWorkspace('APP-2')
    else runtime.lowcodeApi.application.clear()

    await expect(gateway.writeText(resource.scenarioId, text, text)).rejects.toThrow(/SPARK_EXECUTION_SCOPE_(STALE|REQUIRED)/u)

    expect(host).not.toHaveBeenCalled()
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('blocks builtin tool-file remote IO per operation without rejecting gateway construction', async () => {
    const applicationId = getBuiltinApplicationDescriptor().id
    sceneWorkspace(applicationId)
    const gateway = runtime.createLowcodeProjectGateways(applicationId)
    const io = runtime.createPageToolFilesIo(applicationId)
    expect(gateway.pageFiles).toBeDefined()
    expect(io).toBeDefined()
    if (!gateway.pageFiles.saveFileContent) throw new Error('missing page-file save gateway')
    await expect(gateway.pageFiles.readPageFile({projectId: applicationId, pageId: 'orders', fileName: 'script.js'}))
      .rejects.toThrow('BUILTIN_PAGE_FILE_SOURCE_UNAVAILABLE')
    await expect(gateway.pageFiles.saveFileContent('orders', 'script.js', 'text'))
      .rejects.toThrow('BUILTIN_PAGE_FILE_SOURCE_UNAVAILABLE')
    await expect(io.list(applicationId, 'orders')).rejects.toThrow('BUILTIN_PAGE_FILE_SOURCE_UNAVAILABLE')
    await expect(io.read(applicationId, 'orders', 'script.js')).rejects.toThrow('BUILTIN_PAGE_FILE_SOURCE_UNAVAILABLE')
    await expect(io.upload({appId: applicationId, pageId: 'orders', fileName: 'script.js', text: 'text'}))
      .rejects.toThrow('BUILTIN_PAGE_FILE_SOURCE_UNAVAILABLE')
    await expect(io.restoreWorkingFile({appId: applicationId, pageId: 'orders', fileName: 'script.js', text: 'text'}))
      .rejects.toThrow('BUILTIN_PAGE_FILE_SOURCE_UNAVAILABLE')
    await expect(io.listVersions({appId: applicationId, customPath: `${applicationId}/orders`, fileName: 'script.js'}))
      .rejects.toThrow('BUILTIN_PAGE_FILE_SOURCE_UNAVAILABLE')
    await expect(io.uploadVersion({appId: applicationId, customPath: `${applicationId}/orders`, fileName: 'script.js', version: 1, text: 'text'}))
      .rejects.toThrow('BUILTIN_PAGE_FILE_SOURCE_UNAVAILABLE')
    await expect(io.readVersion({appId: applicationId, customPath: `${applicationId}/orders`, fileName: 'script.js', version: 1}))
      .rejects.toThrow('BUILTIN_PAGE_FILE_SOURCE_UNAVAILABLE')
    await expect(io.remove(applicationId, 'orders', 'script.js')).rejects.toThrow('BUILTIN_PAGE_FILE_SOURCE_UNAVAILABLE')
    expect(transport.request).not.toHaveBeenCalled()
  })
})

function model(input: Readonly<{
  modelId: string
  name: string
  resourceName: string
  fields: readonly Readonly<{ id: string; name: string; alias?: string; primaryKey?: boolean }>[]
}>): LowcodeDataSpaceAssemblerInput['models'][number] {
  return {
    id: input.modelId, name: input.name, metaName: input.name,
    sourceName: input.resourceName, sourceId: 'DATABASE-1', sourceType: 'table',
    primaryKey: input.fields.find(item => item.primaryKey)?.name ?? 'id', businessMain: true, raw: {},
    fields: input.fields.map(item => ({id: item.id, modelId: input.modelId, name: item.name,
      canonicalName: item.alias || item.name, type: 'integer', primaryKey: item.primaryKey === true,
      description: '', output: true, computed: false, order: 0, orderType: '', raw: {}})),
  }
}

function design() {
  const models = [
    model({modelId: 'MODEL-PARENT', name: '部门模型', resourceName: 'Department',
      fields: [{id: 'FIELD-P-ID', name: 'id', primaryKey: true}]}),
    model({modelId: 'MODEL-CHILD', name: '员工模型', resourceName: 'Employee', fields: [
      {id: 'FIELD-C-ID', name: 'id', primaryKey: true}, {id: 'FIELD-C-PARENT', name: 'departmentId'},
    ]}),
  ]
  const relations: LowcodeDataSpaceAssemblerInput['relations'] = [{
    sourceRelationId: 'RELATION-1', dataSpaceId: 'SPACE-1', parentModelId: 'MODEL-PARENT', childModelId: 'MODEL-CHILD',
    parentResourceName: 'Department', childResourceName: 'Employee', dependencyType: 'allRows', cascadeDelete: false,
    filterExpression: DataViewFilter.group({logic: 'and', filters: [
      {field: 'departmentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}},
    ]}),
  }]
  return {name: '组织场景', models, relations}
}

class RuntimeFixtureHttpClient extends HttpClientBase {
  public constructor(private readonly parentIds: readonly number[] = [7]) { super() }
  public readonly requests: RequestConfig[] = []

  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    const request = isRecord(config.data) ? config.data : {}
    const tables = Array.isArray(request['Table']) ? request['Table'] : []
    const table = isRecord(tables[0]) ? tables[0] : {}
    const modelName = typeof table['Name'] === 'string' ? table['Name'] : ''
    const rows = modelName === '部门模型'
      ? this.parentIds.map(id => ({ id, lingma_sys_key: `P-${id}`, lingma_sys_params: { r: [], e: [], h: [], m: [], d: false } }))
      : modelName === 'AI记录'
        ? [{rowid: 'AI-ROW-1', titleAlias: '业务标题', noteAlias: '业务备注', lingma_sys_key: 'AI-ROW-1',
          lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}}]
        : [{ id: 70, departmentId: 7, lingma_sys_key: 'C-70', lingma_sys_params: { r: [], e: ['departmentId'], h: [], m: [], d: false } }]
    return {
      data: {
        Code: 200,
        Result: {
          primaryKeyField: modelName === 'AI记录' ? 'rowid' : 'id',
          allowAdd: true,
          lingma_sys_key: modelName === '部门模型' ? 'PARENT' : 'CHILD',
          data: { Items: rows, Count: rows.length },
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

function formalAssemblyInput(snapshot: ReturnType<typeof design>, scenarioId: string,
  options: Readonly<{viewCascades?: readonly unknown[]; namedViews?: readonly string[]}> = {}): LowcodeDataSpaceAssemblerInput {
  const tables = Object.fromEntries(snapshot.models.map(model => [model.id, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: Object.fromEntries(['default', ...(options.namedViews ?? [])].map(viewId => [viewId, {}]))}]))
  const config = new ScenarioViewConfig(scenarioId, JSON.stringify({scenarioId, tables, ...(options.viewCascades === undefined ? {} : {viewCascades: options.viewCascades})}))
  return {config, space: {dataSpaceId: scenarioId, name: snapshot.name}, models: snapshot.models, relations: snapshot.relations}
}

describe('lowcode data-space DataView runtime', () => {
  it('assembles one column from equivalent repeated formal output records', () => {
    const input = formalAssemblyInput(design(), 'FORM-1')
    const child = input.models.find(candidate => candidate.id === 'MODEL-CHILD')
    const parentField = child?.fields.find(candidate => candidate.name === 'departmentId')
    if (!child || !parentField) throw new Error('missing child output fixture')
    const models = input.models.map(candidate => candidate.id === child.id
      ? { ...candidate, fields: [...candidate.fields, { ...parentField, id: 'FIELD-C-PARENT-DUP' }] }
      : candidate)
    const http = new RuntimeFixtureHttpClient()
    const assembly = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({ http,
      readScope: () => ({ token: 'fixture-request-scope', headers: {} }) }), http)
      .assemble({ ...input, models })

    expect(assembly.dataSet.getTable('MODEL-CHILD')?.columns.filter(column => column.name === 'departmentId'))
      .toHaveLength(1)
    assembly.dataSet.destroy()
  })

  it('sends explicit view cascade constraints through the sole API wire codec', async () => {
    const http = new RuntimeFixtureHttpClient()
    const explicitCascade = [{cascadeId:'SCENE-CASCADE', parentTable:'MODEL-PARENT', parentViewId:'default', childTable:'MODEL-CHILD', childViewId:'default', filterBindings:[{sourceField:'id',targetField:'departmentId'}], autoLoad:true}]
    const assembly = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({ http,
      readScope: () => ({ token: 'fixture-request-scope', headers: {} }) }), http).assemble({
      ...formalAssemblyInput(design(), 'FORM-1', {viewCascades: explicitCascade}),
    })
    const child = assembly.dataSet.getView('MODEL-CHILD', 'default')
    if (!child) throw new Error('Missing child DataView')
    const input = { field: 'id', operator: 'gte' as const,
      value: { Type: 'GetSysParam', Param: 'CURRENT_USER', Extra: [false, 0, ''] } }
    child.configure({ filterExpression: { logic: 'or', filters: [
      input, { field: 'departmentId', operator: 'is-not-empty' },
    ] } })
    input.value.Extra.push('changed')
    await child.requestData()
    expect(child.requestState).toBe(RequestState.Loaded)
    expect(http.requests).toHaveLength(2)
    expect(http.requests[1]?.data).toMatchObject({ Table: [{
      Name: '员工模型',
      Filter: { Type: 'and', Filters: [
        { Type: 'cond', Field: 'departmentId', Operator: 'equal', Value: null,
          ValueFun: { Type: 'GetConstValue', Value: 7 } },
        { Type: 'or', Filters: [
          { Type: 'cond', Field: 'id', Operator: 'greaterthanorequal', Value: null,
            ValueFun: { Type: 'GetSysParam', Param: 'CURRENT_USER', Extra: [false, 0, ''] } },
          { Type: 'cond', Field: 'departmentId', Operator: 'isnotempty', Value: null,
            ValueFun: { Type: 'GetConstValue', Value: null } },
        ] },
      ] },
    }] })
    assembly.dataSet.destroy()
  })

  it('does not query a parent or add a filter when the scenario has no view cascade', async () => {
    const http = new RuntimeFixtureHttpClient()
    const assembly = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({ http,
      readScope: () => ({ token: 'fixture-request-scope', headers: {} }) }), http).assemble({
      ...formalAssemblyInput(design(), 'FORM-1'),
    })
    const child = assembly.dataSet.getView('MODEL-CHILD', 'default')
    if (!child) throw new Error('Missing child DataView')
    expect(assembly.dataSet.viewCascades).toEqual([])
    await child.requestData()
    expect(http.requests).toHaveLength(1)
    const request = isRecord(http.requests[0]?.data) ? http.requests[0].data : {}
    const tables = Array.isArray(request['Table']) ? request['Table'] : []
    expect(tables[0]).toMatchObject({Name:'员工模型'})
    expect(tables[0]).toHaveProperty('Filter', null)
    assembly.dataSet.destroy()
  })

  it('applies an explicit named-view query filter without touching sibling views', async () => {
    const http = new RuntimeFixtureHttpClient([7, 8])
    const explicitCascade = [{cascadeId:'NAMED-CASCADE', parentTable:'MODEL-PARENT', parentViewId:'selection', childTable:'MODEL-CHILD', childViewId:'detail', filterBindings:[{sourceField:'id',targetField:'departmentId'}], autoLoad:true}]
    const input = formalAssemblyInput(design(), 'FORM-1', {viewCascades: explicitCascade, namedViews: ['selection', 'detail', 'summary']})
    const assembly = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({ http,
      readScope: () => ({ token: 'fixture-request-scope', headers: {} }) }), http).assemble(input)
    const parentDefault = assembly.dataSet.getView('MODEL-PARENT', 'default')
    const parentSelection = assembly.dataSet.getView('MODEL-PARENT', 'selection')
    const childDefault = assembly.dataSet.getView('MODEL-CHILD', 'default')
    const childDetail = assembly.dataSet.getView('MODEL-CHILD', 'detail')
    const childSummary = assembly.dataSet.getView('MODEL-CHILD', 'summary')
    if (!parentDefault || !parentSelection || !childDefault || !childDetail || !childSummary) throw new Error('Missing named DataView')
    parentSelection.autoCurrentFirst = false
    expect(parentDefault).not.toBe(parentSelection)
    expect(assembly.dataSet.viewCascades).toMatchObject([{parentViewId:'selection',childViewId:'detail'}])
    const structuralRelations = structuredClone(assembly.dataSet.resourceRelations)
    const inputRelations = input.relations.map(relation => ({...relation, filter: relation.filterExpression.toJSON()}))
    await childDefault.requestData()
    expect(http.requests).toHaveLength(1)
    expect(parentDefault.rows).toEqual([])
    await parentSelection.requestData()
    expect(http.requests).toHaveLength(2)
    expect(parentSelection.setCurrentRowById(7)).toBe(true)
    expect(parentSelection.setCurrentRowById(8)).toBe(true)
    expect(parentSelection.currentRow).toMatchObject({id:8})
    await childDetail.refresh()
    expect(http.requests).toHaveLength(3)
    expect(http.requests[2]?.data).toMatchObject({Table:[{Name:'员工模型',Filter:{Type:'cond',Field:'departmentId',ValueFun:{Type:'GetConstValue',Value:8}}}]})
    expect(childDefault.requestState).toBe(RequestState.Loaded)
    expect(childSummary.requestState).toBe(RequestState.Idle)
    expect(assembly.dataSet.resourceRelations).toEqual(structuralRelations)
    expect(input.relations.map(relation => ({...relation, filter: relation.filterExpression.toJSON()}))).toEqual(inputRelations)
    assembly.dataSet.destroy()
  })

  it('keeps an explicit view cascade when no model relationship exists', () => {
    const input = formalAssemblyInput(design(), 'FORM-1', {viewCascades: [
      {cascadeId:'SCENE-ONLY', parentTable:'MODEL-PARENT', parentViewId:'default', childTable:'MODEL-CHILD', childViewId:'default', filterBindings:[{sourceField:'id',targetField:'departmentId'}], autoLoad:false},
    ]})
    const http = new RuntimeFixtureHttpClient()
    const assembly = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({ http,
      readScope: () => ({ token: 'fixture-request-scope', headers: {} }) }), http)
      .assemble({...input, relations: []})
    expect(assembly.dataSet.viewCascades).toMatchObject([{cascadeId:'SCENE-ONLY', filterBindings:[{sourceField:'id',targetField:'departmentId'}]}])
    expect(assembly.dataSet.resourceRelations).toEqual([])
    assembly.dataSet.destroy()
  })

  it('assembles model-bound views with original private permissions and no CRUD query transforms', async () => {
    const http = new RuntimeFixtureHttpClient()
    const assembler = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({ http,
      readScope: () => ({ token: 'fixture-request-scope', headers: {} }) }), http)
    const assembly = assembler.assemble({
      ...formalAssemblyInput(design(), 'FORM-1'),
    })

    expect(assembly.diagnostics).toEqual([])
    expect(assembly.dataSet.scenarioId).toBe('FORM-1')
    expect(assembly.dataSet.getTable('MODEL-CHILD')?.modelBinding).toEqual({
      modelId: 'MODEL-CHILD',
      modelName: '员工模型',
    })
    expect(assembly.dataSet.getTable('RESOURCE-CHILD')).toBeUndefined()
    expect(assembly.dataSet.resourceRelations?.[0]).toMatchObject({
      sourceRelationId: 'RELATION-1',
      parentTable: 'MODEL-PARENT',
      childTable: 'MODEL-CHILD',
      filterExpression: {logic: 'and', filters: [{field: 'departmentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}]},
    })
    expect(assembly.dataSet.viewCascades).toEqual([])

    const childView = assembly.dataSet.getView('MODEL-CHILD', 'default')
    expect(childView).toBeDefined()
    await childView?.requestData()

    expect(http.requests).toHaveLength(1)
    expect(http.requests.every(request => request.headers?.['x-FormKey'] === 'FORM-1')).toBe(true)
    expect(childView?.requestState).toBe(RequestState.Loaded)
    expect(childView?.rows).toMatchObject([{ id: 70, departmentId: 7 }])
    expect(childView).not.toHaveProperty('permissionSnapshot')
    expect(childView?.fieldAccess(childView.rows[0] ?? null, 'departmentId').write).toBe('allowed')
    expect(childView?.fieldAccess(childView.rows[0] ?? null, 'id').write).toBe('denied')
    expect(childView?.rows[0]).not.toHaveProperty('lingma_sys_params')
    expect(childView?.page).toBe(1)
    expect(assembly.dataSet.getTable('MODEL-CHILD')?.toJson().api).toBeUndefined()
    expect(http.requests[0]?.data).toMatchObject({ PageParam: { index: 1, size: 20 }, Table: [{ Name: '员工模型', Filter: null }] })
    const request = isRecord(http.requests[0]?.data) ? http.requests[0].data : {}
    const tables = Array.isArray(request['Table']) ? request['Table'] : []
    expect(tables[0]).not.toHaveProperty('MetaName')
    expect(tables[0]).not.toHaveProperty('PrimaryKeyFields')
    expect(tables[0]).not.toHaveProperty('Type')
    assembly.dataSet.destroy()
  })

  it('assembles two independent read-only views for one keyless formal model', async () => {
    const http = new RuntimeFixtureHttpClient()
    const input = formalAssemblyInput(design(), 'FORM-1', { namedViews: ['selection'] })
    const model = input.models.find(item => item.id === 'MODEL-CHILD')
    if (!model) throw new Error('missing child model')
    const keyless = { ...model, sourceType: '字典', primaryKey: '',
      fields: model.fields.map(field => ({ ...field, primaryKey: false })) }
    const assembly = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({ http,
      readScope: () => ({ token: 'fixture-request-scope', headers: {} }) }), http).assemble({
      ...input, models: input.models.map(item => item.id === model.id ? keyless : item), relations: [],
    })
    const first = assembly.dataSet.getView('MODEL-CHILD', 'default')
    const second = assembly.dataSet.getView('MODEL-CHILD', 'selection')
    if (!first || !second) throw new Error('missing keyless views')
    expect(first.primaryKey).toBe('')
    expect(second.primaryKey).toBe('')
    await first.requestData()
    expect(second.rows).toEqual([])
    await second.requestData()
    const firstRow = first.rows[0]
    const secondRow = second.rows[0]
    if (!firstRow || !secondRow) throw new Error('missing keyless rows')
    expect(first.getPkKey(firstRow)).toBeUndefined()
    expect(first.fieldAccess(firstRow, 'departmentId')).toMatchObject({ read: 'visible', write: 'denied' })
    expect(second.fieldAccess(secondRow, 'departmentId')).toMatchObject({ read: 'visible', write: 'denied' })
    expect(first.fieldAccess(secondRow, 'departmentId').read).toBe('invisible')
    expect(second.fieldAccess(firstRow, 'departmentId').read).toBe('invisible')
    expect(http.requests).toHaveLength(2)
    assembly.dataSet.destroy()
  })

  it('builds independent tables for two models over the same resource', async () => {
    const http = new RuntimeFixtureHttpClient()
    const sharedFields = [{ id: 'FIELD-ID', name: 'id', primaryKey: true }]
    const assembly = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({ http,
      readScope: () => ({ token: 'fixture-request-scope', headers: {} }) }), http).assemble({
      ...formalAssemblyInput({
        name: '组织场景',
        models: [
          model({ modelId: 'MODEL-A', name: '部门模型', resourceName: 'Department', fields: sharedFields }),
          model({ modelId: 'MODEL-B', name: '员工模型', resourceName: 'Department', fields: sharedFields }),
        ],
        relations: [],
      }, 'FORM-1'),
    })

    expect(assembly.diagnostics).toEqual([])
    expect(assembly.dataSet.getTable('RESOURCE-SHARED')).toBeUndefined()
    expect(assembly.dataSet.getTable('MODEL-A')?.modelBinding).toEqual({ modelId: 'MODEL-A', modelName: '部门模型' })
    expect(assembly.dataSet.getTable('MODEL-B')?.modelBinding).toEqual({ modelId: 'MODEL-B', modelName: '员工模型' })
    expect(assembly.dataSet.getView('MODEL-A', 'default')).not.toBe(assembly.dataSet.getView('MODEL-B', 'default'))

    await assembly.dataSet.getView('MODEL-B', 'default')?.requestData()
    expect(http.requests).toHaveLength(1)
    const sent = isRecord(http.requests[0]?.data) ? http.requests[0].data : {}
    const tables = Array.isArray(sent['Table']) ? sent['Table'] : []
    expect(isRecord(tables[0]) ? tables[0]['Name'] : undefined).toBe('员工模型')
  })

  it('keeps allowAIAdd on formal DataTable columns while every native DataView inherits its output columns', async () => {
    const model = DataSpaceDesignApi.projectModel({rowid: 'MODEL-AI', dataSetId: 'FORM-AI', Name: 'AI记录',
      Type: '数据库表', MetaName: 'AI_RECORDS', DbId: 'DATABASE-AI', PrimaryKeyFields: 'rowid', IsBusinessMain: 1}, [
      {rowid: 'FIELD-PK', dataSetId: 'FORM-AI', dataModelId: 'MODEL-AI', type: 'dataModel',
        Name: 'rowid', FieldType: '字符串', IsPKey: 1, IsOutput: 1},
      {rowid: 'FIELD-ON', dataSetId: 'FORM-AI', dataModelId: 'MODEL-AI', type: 'dataModel',
        Name: 'title_source', AsName: 'titleAlias', FieldType: '字符串', IsPKey: 0, IsOutput: 1, allowAIAdd: 1},
      {rowid: 'FIELD-OFF', dataSetId: 'FORM-AI', dataModelId: 'MODEL-AI', type: 'dataModel',
        Name: 'note_source', AsName: 'noteAlias', FieldType: '字符串', IsPKey: 0, IsOutput: 1, allowAIAdd: '0'},
      {rowid: 'FIELD-HIDDEN', dataSetId: 'FORM-AI', dataModelId: 'MODEL-AI', type: 'dataModel',
        Name: 'internal_source', AsName: 'internalAlias', FieldType: '字符串', IsPKey: 0, IsOutput: 0, allowAIAdd: 1},
    ], 'rowid')
    const directColumns = LowcodeDataSpaceViewFields.columns(model, [
      {name: 'titleAlias', allowAIAdd: false}, {name: 'noteAlias', allowAIAdd: true},
    ], 'MODEL-AI')
    expect(directColumns.find(column => column.name === 'titleAlias')).toMatchObject({allowAIAdd: true})
    expect(directColumns.find(column => column.name === 'noteAlias')).toMatchObject({allowAIAdd: false})
    const config = new ScenarioViewConfig('FORM-AI', JSON.stringify({scenarioId: 'FORM-AI', tables: {
      'MODEL-AI': {
        modelBinding: {modelId: 'MODEL-AI', modelName: 'AI记录'},
        views: {default: {}, selection: {}},
      },
    }}))
    expect(() => new ScenarioViewConfig('FORM-AI', JSON.stringify({scenarioId: 'FORM-AI', tables: {
      'MODEL-AI': {modelBinding: {modelId: 'MODEL-AI', modelName: 'AI记录'},
        columns: [{name: 'titleAlias', allowAIAdd: false}]},
    }}))).toThrow(/allowAIAdd/)
    expect(() => new ScenarioViewConfig('FORM-AI', JSON.stringify({scenarioId: 'FORM-AI', tables: {
      'MODEL-AI': {modelBinding: {modelId: 'MODEL-AI', modelName: 'AI记录'}, views: {default: {}, selection: {
        fieldProjection: [{fieldId: 'FIELD-ON', source: 'resource', resourceFieldId: 'FIELD-ON',
          resourceField: 'title_source', viewField: 'titleAlias', type: '字符串', label: '标题',
          output: true, sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: false,
          value: '', valueFunction: '', expression: '', allowAIAdd: false}],
      }}},
    }}))).toThrow(/allowAIAdd/)
    const http = new RuntimeFixtureHttpClient()
    const assembly = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({http,
      readScope: () => ({token: 'fixture-request-scope', headers: {}})}), http).assemble({
      config, space: {dataSpaceId: 'FORM-AI', name: 'AI字段元数据'}, models: [model], relations: [],
    })
    const table = assembly.dataSet.getTable('MODEL-AI')
    const defaultView = assembly.dataSet.getView('MODEL-AI', 'default')
    const selectionView = assembly.dataSet.getView('MODEL-AI', 'selection')
    if (!table || !defaultView || !selectionView) throw new Error('Missing assembled AI DataTable/DataView')

    expect(table.columns.find(column => column.name === 'titleAlias')).toMatchObject({allowAIAdd: true})
    expect(table.columns.find(column => column.name === 'noteAlias')).toMatchObject({allowAIAdd: false})
    expect(table.columns.find(column => column.name === 'internalAlias')).toMatchObject({allowAIAdd: true})
    expect(defaultView.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({name: 'titleAlias', allowAIAdd: true}),
      expect.objectContaining({name: 'noteAlias', allowAIAdd: false}),
    ]))
    expect(defaultView.columns.map(column => column.name)).not.toContain('internalAlias')
    expect(selectionView.columns).toEqual(defaultView.columns)
    expect(selectionView.dataTable).toBe(table)
    expect(defaultView.dataTable).toBe(table)

    // DataSet's native snapshot carries the formal column boolean and restores it without a pagedata copy.
    const snapshot = assembly.dataSet.toJson()
    const snapshotTable = snapshot.tables['MODEL-AI']
    expect(snapshotTable?.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({name: 'titleAlias', allowAIAdd: true}),
      expect.objectContaining({name: 'noteAlias', allowAIAdd: false}),
    ]))
    const restored = DataSet.fromJson(snapshot)
    expect(restored.getTable('MODEL-AI')?.columns.find(column => column.name === 'titleAlias'))
      .toMatchObject({allowAIAdd: true})
    expect(restored.getView('MODEL-AI', 'selection')?.columns)
      .toEqual(restored.getView('MODEL-AI', 'default')?.columns)

    await defaultView.requestData()
    expect(defaultView.rows.length).toBeGreaterThan(0)
    expect(defaultView.rows.every(row => !Object.prototype.hasOwnProperty.call(row, 'allowAIAdd'))).toBe(true)
    restored.destroy()
    assembly.dataSet.destroy()
  })
})
