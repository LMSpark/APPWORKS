import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { HttpClientBase, Request } from '@spark-appworks/spark-utils'
import {
  DataSpaceFrontendModel,
  DataSpaceRuntimeApi,
  type DataSpaceDesignSnapshot,
  type LowcodeModelRelationRecord,
} from '@spark-appworks/spark-lowcode-api'
import { DataViewFilter, RequestState } from '@spark-appworks/spark-data'
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'

const transport = { request: vi.fn() }
const originalTransport = Object.getOwnPropertyDescriptor(Request.prototype, 'executeRequest')
let runtime: typeof import('../../../src/lowcode/lowcode-runtime')

import { ScenarioViewConfig } from '../../../packages/spark-project-model/src/scenario/scenario-view-config'
import { LowcodeDataSpaceAssembler } from '../../../src/lowcode/data-space/lowcode-data-space-assembler'

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
  afterAll(() => {
    if (originalTransport) Object.defineProperty(Request.prototype, 'executeRequest', originalTransport)
  })
  afterEach(() => {
    transport.request.mockReset()
    runtime.lowcodeApi.application.clear()
    runtime.lowcodeApi.session.clear()
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

  it('saves tool working files and restores filename snapshots without changing the snapshot', async () => {
    const workspace = sceneWorkspace()
    const snapshot = '\uFEFFconst value = "历史";\r\n'
    const files = new Map([['3__script.js', snapshot]])
    const requests: RequestConfig[] = []
    transport.request.mockImplementation(async (config: RequestConfig) => {
      requests.push(config)
      let data: unknown
      if (config.data instanceof FormData) {
        expect(config.data.get('customPath')).toBe('APP-1/orders')
        expect(config.data.get('isReplace')).toBe('true')
        const file = config.data.get('file')
        const name = config.data.get('newName')
        if (!(file instanceof Blob) || typeof name !== 'string') throw new Error('invalid upload')
        files.set(name, new TextDecoder('utf-8', { ignoreBOM: true }).decode(await file.arrayBuffer()))
        data = { Code: 200, Result: [{ state: 'success' }] }
      } else {
        if (!isRecord(config.data) || typeof config.data['fileName'] !== 'string') throw new Error('invalid file read')
        expect(config.data['customPath']).toBe('APP-1/orders')
        const text = files.get(config.data['fileName'])
        if (text === undefined) throw new Error('file not found')
        if (config.url === '/api/File/DownFile') {
          const bytes = new TextEncoder().encode(text)
          const buffer = new ArrayBuffer(bytes.length)
          new Uint8Array(buffer).set(bytes)
          data = buffer
        } else {
          data = { Code: 200, Result: text }
        }
      }
      expect(config.headers).toMatchObject({ 'X-AppId': 'APP-1', 'tenant-id': 'fixture-tenant' })
      return { data, status: 200, statusText: 'OK', headers: {} }
    })
    const page = workspace.project.openPageDesign('orders')
    workspace.project.setActivePage('orders')
    page.setFileText('script.js', 'working')
    await workspace.savePageFile('script.js')
    expect(page.script.isDirty).toBe(false)
    expect(files.get('script.js')).toBe('working')

    await workspace.restoreRemotePageVersion(3, 'script.js')
    expect(files.get('script.js')).toBe(snapshot)
    expect(files.get('3__script.js')).toBe(snapshot)
    expect(page.script.text).toBe(snapshot)
    expect(page.script.isDirty).toBe(false)
    expect(requests.map(request => request.url)).toEqual([
      '/api/File/UploadFile', '/api/File/DownFile', '/api/File/DownFile',
      '/api/File/UploadFile', '/api/File/DownFile', '/api/File/content/text',
    ])
  })

  it('refuses restoration over an unsaved tool file before transport', async () => {
    const workspace = sceneWorkspace()
    const page = workspace.project.openPageDesign('orders')
    workspace.project.setActivePage('orders')
    page.setFileText('script.js', 'unsaved')
    await expect(workspace.restoreRemotePageVersion(1, 'script.js')).rejects.toThrow('未保存')
    expect(page.script.text).toBe('unsaved')
    expect(page.script.isDirty).toBe(true)
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('rejects tool writes and restoration from another application before transport', async () => {
    sceneWorkspace('APP-2')
    const gateway = runtime.createLowcodeProjectGateways('APP-1').pageFiles
    if (!gateway.saveFileContent || !gateway.restoreVersion) throw new Error('missing tool file gateway')
    await expect(gateway.readPageFile({ projectId: 'APP-1', pageId: 'orders', fileName: 'script.js' }))
      .rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    await expect(gateway.saveFileContent('orders', 'script.js', 'changed')).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    await expect(gateway.restoreVersion('orders', 'script.js', 1)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(transport.request).not.toHaveBeenCalled()
  })

  it.each(['/api/File/UploadFile', '/api/File/content/text'])(
    'retains local edits made during restore at %s', async editAt => {
      const workspace = sceneWorkspace()
      const page = workspace.project.openPageDesign('orders')
      workspace.project.setActivePage('orders')
      page.hydrateFileText('script.js', 'previous')
      transport.request.mockImplementation(async (config: RequestConfig) => {
        if (config.url === editAt) page.setFileText('script.js', 'new local edit')
        let data: unknown
        if (config.url === '/api/File/UploadFile') data = { Code: 200, Result: [{ state: 'success' }] }
        else if (config.url === '/api/File/DownFile') {
          const bytes = new TextEncoder().encode('snapshot')
          const buffer = new ArrayBuffer(bytes.length)
          new Uint8Array(buffer).set(bytes)
          data = buffer
        } else data = { Code: 200, Result: 'snapshot' }
        return { data, status: 200, statusText: 'OK', headers: {} }
      })
      await expect(workspace.restoreRemotePageVersion(1, 'script.js')).rejects.toThrow('恢复期间文件已修改')
      expect(page.script.text).toBe('new local edit')
      expect(page.script.isDirty).toBe(true)
    },
  )

  it('keeps a failed tool working-file readback dirty', async () => {
    const workspace = sceneWorkspace()
    const page = workspace.project.openPageDesign('orders')
    workspace.project.setActivePage('orders')
    page.setFileText('script.js', 'submitted')
    transport.request.mockImplementation(async (config: RequestConfig) => ({
      data: config.url === '/api/File/UploadFile'
        ? { Code: 200, Result: [{ state: 'success' }] }
        : new ArrayBuffer(0),
      status: 200, statusText: 'OK', headers: {},
    }))
    await expect(workspace.savePageFile('script.js')).rejects.toThrow('回读不一致')
    expect(page.script.isDirty).toBe(true)
    expect(page.script.text).toBe('submitted')
  })

  it('rejects a snapshot from a retired application before uploading the working file', async () => {
    sceneWorkspace()
    const gateway = runtime.createLowcodeProjectGateways('APP-1').pageFiles
    if (!gateway.restoreVersion) throw new Error('missing restore gateway')
    transport.request.mockImplementation(async () => {
      sceneWorkspace('APP-2')
      return { data: new ArrayBuffer(0), status: 200, statusText: 'OK', headers: {} }
    })
    await expect(gateway.restoreVersion('orders', 'script.js', 1)).rejects.toThrow('SPARK_EXECUTION_SCOPE_STALE')
    expect(transport.request).toHaveBeenCalledTimes(1)
  })

  it('snapshots and restores shared scene files by actual filename without touching tool publishing', async () => {
    sceneWorkspace()
    const current = JSON.stringify({ scenarioId: 'SCENE-1', tables: {} })
    const previous = JSON.stringify({ scenarioId: 'SCENE-1', tables: {}, viewCascades: [] }, null, 2)
    const files = new Map([['pagedata.json', current], ['0__pagedata.json', previous], ['8__script.js', 'unrelated']])
    const gateway = runtime.createLowcodeProjectGateways('APP-1').scenarioViews
    if (!gateway.listVersions || !gateway.createVersion || !gateway.readVersion || !gateway.restoreVersion) throw new Error('missing scene version gateway')
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
    await gateway.restoreVersion('SCENE-1',0)
    expect(files.get('pagedata.json')).toBe(previous)
    expect(files.get('0__pagedata.json')).toBe(previous)
    expect(files.get('1__pagedata.json')).toBe(current)
    expect(transport.request.mock.calls.every(([config])=>config.url.startsWith('/api/File/'))).toBe(true)
  })

  it('rejects unsafe scene versions and foreign application history before transport', async () => {
    sceneWorkspace()
    const gateway = runtime.createLowcodeProjectGateways('APP-1').scenarioViews
    if(!gateway.readVersion || !gateway.restoreVersion || !gateway.listVersions)throw new Error('missing scene version gateway')
    for(const version of [-1, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(gateway.readVersion('SCENE-1',version)).rejects.toThrow('非负安全整数')
      await expect(gateway.restoreVersion('SCENE-1',version)).rejects.toThrow('非负安全整数')
    }
    sceneWorkspace('APP-2')
    await expect(gateway.listVersions('SCENE-1')).rejects.toThrow('SCOPE_STALE')
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('does not upload a corrupted or different-scene snapshot when restoring', async () => {
    sceneWorkspace()
    const gateway=runtime.createLowcodeProjectGateways('APP-1').scenarioViews
    if(!gateway.restoreVersion)throw new Error('missing scene restore')
    for(const text of ['invalid JSON',JSON.stringify({scenarioId:'OTHER',tables:{}})]) {
      transport.request.mockImplementation(async()=>{
        const bytes=new TextEncoder().encode(text), buffer=new ArrayBuffer(bytes.length)
        new Uint8Array(buffer).set(bytes)
        return {data:buffer,status:200,statusText:'OK',headers:{}}
      })
      await expect(gateway.restoreVersion('SCENE-1',0)).rejects.toThrow()
    }
    expect(transport.request.mock.calls.every(([config])=>config.url === '/api/File/DownFile')).toBe(true)
  })

  it('rejects conflicting scene working content before snapshot upload', async () => {
    sceneWorkspace()
    const gateway=runtime.createLowcodeProjectGateways('APP-1').scenarioViews
    if(!gateway.createVersion)throw new Error('missing scene snapshot')
    transport.request.mockImplementation(async(config:RequestConfig)=>({data:{Code:200,Result:config.url === '/api/File/list'?[]:'changed remotely'},status:200,statusText:'OK',headers:{}}))
    await expect(gateway.createVersion('SCENE-1',JSON.stringify({scenarioId:'SCENE-1',tables:{}}))).rejects.toThrow('CONFLICT')
    expect(transport.request.mock.calls.some(([config])=>config.url === '/api/File/UploadFile')).toBe(false)
  })

  it('uses actual filename history for creation and confirms snapshot deletion without publishing', async () => {
    sceneWorkspace()
    const files = new Map([['script.js', 'working'], ['2__script.js', 'previous'], ['9__style.css', 'other']])
    const gateway = runtime.createLowcodeProjectGateways('APP-1').pageFiles
    if (!gateway.listVersions || !gateway.createVersion || !gateway.deleteVersion) throw new Error('missing version gateway')
    transport.request.mockImplementation(async (config: RequestConfig) => {
      let data: unknown
      if (config.url === '/api/File/list') {
        data = { Code: 200, Result: [...files.keys()].map(name => ({ name, lastModified: 100 })) }
      } else if (config.url === '/api/File/RemoveFile') {
        expect(config.params).toMatchObject({ customPath: 'APP-1/orders', fileName: '3__script.js' })
        files.delete('3__script.js')
        data = { Code: 200 }
      } else if (config.data instanceof FormData) {
        const name = config.data.get('newName')
        const file = config.data.get('file')
        if (typeof name !== 'string' || !(file instanceof Blob)) throw new Error('invalid upload')
        expect(config.data.get('isReplace')).toBe('false')
        files.set(name, new TextDecoder().decode(await file.arrayBuffer()))
        data = { Code: 200, Result: [{ state: 'success', filePath: `APP-1/orders/${name}` }] }
      } else {
        if (!isRecord(config.data) || typeof config.data['fileName'] !== 'string') throw new Error('invalid read')
        const text = files.get(config.data['fileName'])
        if (text === undefined) throw new Error('file missing')
        if (config.url === '/api/File/DownFile') {
          const bytes = new TextEncoder().encode(text)
          const buffer = new ArrayBuffer(bytes.length)
          new Uint8Array(buffer).set(bytes)
          data = buffer
        } else data = { Code: 200, Result: text }
      }
      return { data, status: 200, statusText: 'OK', headers: {} }
    })
    expect(await gateway.listVersions('orders', 'script.js')).toEqual([{ version: 2, fileName: '2__script.js', lastModified: 100 }])
    await gateway.createVersion('orders', 'script.js')
    expect(files.get('3__script.js')).toBe('working')
    expect(files.get('script.js')).toBe('working')
    await gateway.deleteVersion('orders', 'script.js', 3)
    expect(files.has('3__script.js')).toBe(false)
    expect(transport.request.mock.calls.every(([config]) => config.url.startsWith('/api/File/'))).toBe(true)
  })

  it.each(['..', '../orders', 'parent\\orders'])(
    'rejects invalid tool paths %j before transport', async pageId => {
      sceneWorkspace()
      const gateway = runtime.createLowcodeProjectGateways('APP-1').pageFiles
      if (!gateway.saveFileContent || !gateway.restoreVersion) throw new Error('missing tool gateway')
      await expect(gateway.saveFileContent(pageId, 'script.js', 'text')).rejects.toThrow('合法路径段')
      await expect(gateway.restoreVersion(pageId, 'script.js', 1)).rejects.toThrow('合法路径段')
      expect(transport.request).not.toHaveBeenCalled()
    },
  )

  it('refuses the retired page-local pagedata write and restore paths', async () => {
    sceneWorkspace()
    const gateway = runtime.createLowcodeProjectGateways('APP-1').pageFiles
    if (!gateway.saveFileContent || !gateway.restoreVersion) throw new Error('missing tool gateway')
    await expect(Reflect.apply(gateway.saveFileContent, gateway, ['orders', 'pagedata.json', '{}'])).rejects.toThrow('场景文件')
    await expect(Reflect.apply(gateway.restoreVersion, gateway, ['orders', 'pagedata.json', 1])).rejects.toThrow('不属于工具文件')
    expect(transport.request).not.toHaveBeenCalled()
  })
})

function field(resourceFieldId: string, name: string, primaryKey = false) {
  return {
    resourceFieldId,
    name,
    label: name,
    dataType: primaryKey ? 'int' : 'varchar',
    dataTypeName: primaryKey ? '整数型' : '字符串型',
    length: '',
    nullable: !primaryKey,
    primaryKey,
    unique: primaryKey,
    system: false,
    defaultValue: '',
    description: '',
    order: 0,
  }
}

function model(input: Readonly<{
  modelId: string
  name: string
  resourceId: string
  resourceName: string
  fields: readonly Readonly<{ id: string; name: string; alias?: string; primaryKey?: boolean }>[]
  relations: readonly LowcodeModelRelationRecord[]
}>): DataSpaceFrontendModel {
  const resourceFields = input.fields.map(item => field(`RESOURCE-${item.id}`, item.name, item.primaryKey === true))
  return new DataSpaceFrontendModel({
    dataSpaceId: 'SPACE-1',
    modelId: input.modelId,
    name: input.name,
    resource: {
      resourceId: input.resourceId,
      databaseId: 'DATABASE-1',
      resourceName: input.resourceName,
      resourceType: 'table',
      primaryKeyField: input.fields.find(item => item.primaryKey === true)?.name ?? 'id',
      databaseName: 'payroll',
      fields: resourceFields,
    },
    fields: input.fields.map(item => ({
      fieldId: item.id,
      resourceFieldId: `RESOURCE-${item.id}`,
      resourceField: item.name,
      alias: item.alias ?? '',
      fieldType: '',
      output: true,
      order: 0,
      orderType: '',
      group: 0,
      distinct: false,
      primaryKey: item.primaryKey === true,
      value: '',
      valueFunction: '',
      expression: '',
    })),
    relations: input.relations,
    query: {
      outputType: 'Table',
      filter: '',
      distinct: false,
      businessMain: true,
      joinType: '',
      joinFilter: '',
      parentModelId: '',
      requestComplete: '',
      hasChildField: '',
      parentField: '',
      foreignKeyFields: '',
      requestType: '',
      shortName: '',
      cacheType: '',
      items: '',
      selfType: '',
      topValue: '',
    },
  })
}

const relation: LowcodeModelRelationRecord = {
  sourceRelationId: 'RELATION-1',
  dataSpaceId: 'SPACE-1',
  parentModelId: 'MODEL-PARENT',
  childModelId: 'MODEL-CHILD',
  parentResourceName: 'Department',
  childResourceName: 'Employee',
  filterExpression: JSON.stringify({
    Type: 'cond',
    Field: 'Employee.departmentId',
    Operator: 'equal',
    ValueFun: { Type: 'GetTableField', Field: 'Department.id' },
  }),
  dependencyType: 'allRows',
  cascadeDelete: false,
}

function design(): DataSpaceDesignSnapshot {
  const parent = model({
    modelId: 'MODEL-PARENT',
    name: '部门模型',
    resourceId: 'RESOURCE-PARENT',
    resourceName: 'Department',
    fields: [{ id: 'FIELD-P-ID', name: 'id', primaryKey: true }],
    relations: [relation],
  })
  const child = model({
    modelId: 'MODEL-CHILD',
    name: '员工模型',
    resourceId: 'RESOURCE-CHILD',
    resourceName: 'Employee',
    fields: [
      { id: 'FIELD-C-ID', name: 'id', primaryKey: true },
      { id: 'FIELD-C-PARENT', name: 'departmentId' },
    ],
    relations: [relation],
  })
  return {
    dataSpaceId: 'SPACE-1',
    name: '组织场景',
    description: '',
    inputParameters: [],
    resources: [parent.resource, child.resource],
    models: [parent, child],
    relations: [relation],
  }
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
      : [{ id: 70, departmentId: 7, lingma_sys_key: 'C-70', lingma_sys_params: { r: [], e: ['departmentId'], h: [], m: [], d: false } }]
    return {
      data: {
        Code: 200,
        Result: {
          primaryKeyField: 'id',
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

function formalAssemblyInput(snapshot: DataSpaceDesignSnapshot, scenarioId: string, options: Readonly<{viewCascades?: readonly unknown[]; namedViews?: readonly string[]}> = {}) {
  const models = snapshot.models.map(model => ({ id: model.modelId, name: model.name, metaName: model.name,
    sourceName: model.resource.resourceName, sourceId: model.resource.databaseId ?? '', sourceType: model.resource.resourceType,
    primaryKey: model.resource.primaryKeyField, businessMain: model.query.businessMain, raw: {},
    fields: model.fields.map(field => ({ id: field.fieldId, modelId: model.modelId, name: field.resourceField,
      canonicalName: field.alias || field.resourceField, type: 'integer', primaryKey: field.primaryKey,
      description: '', output: field.output, computed: false, order: field.order, orderType: field.orderType, raw: {} })) }))
  const tables = Object.fromEntries(models.map(model => [model.id, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: Object.fromEntries(['default', ...(options.namedViews ?? [])].map(viewId => [viewId, {}]))}]))
  const config = new ScenarioViewConfig(scenarioId, JSON.stringify({scenarioId, tables, ...(options.viewCascades === undefined ? {} : {viewCascades: options.viewCascades})}))
  const relations = snapshot.relations.map(relation => ({...relation,
    filterExpression: DataViewFilter.group({logic:'and', filters:[{field: 'departmentId',operator:'eq',value:{Type:'GetTableField', Field:'id'}}]})}))
  return {config, space: {dataSpaceId: scenarioId, name: snapshot.name}, models, relations}
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
    const explicitCascade = [{cascadeId:'SCENE-CASCADE', parentTable:'MODEL-PARENT', parentViewId:'default', childTable:'MODEL-CHILD', childViewId:'default', filterBindings:[{sourceField:'id',targetField:'departmentId'}], dependencyType:'allRows', autoLoad:true}]
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
    const explicitCascade = [{cascadeId:'NAMED-CASCADE', parentTable:'MODEL-PARENT', parentViewId:'selection', childTable:'MODEL-CHILD', childViewId:'detail', filterBindings:[{sourceField:'id',targetField:'departmentId'}], dependencyType:'currentRow', autoLoad:true}]
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
      {cascadeId:'SCENE-ONLY', parentTable:'MODEL-PARENT', parentViewId:'default', childTable:'MODEL-CHILD', childViewId:'default', filterBindings:[{sourceField:'id',targetField:'departmentId'}], dependencyType:'selectedRows', autoLoad:false},
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
        dataSpaceId: 'SPACE-1',
        name: '组织场景',
        description: '',
        inputParameters: [],
        resources: [],
        models: [
          model({ modelId: 'MODEL-A', name: '部门模型', resourceId: 'RESOURCE-SHARED', resourceName: 'Department', fields: sharedFields, relations: [] }),
          model({ modelId: 'MODEL-B', name: '员工模型', resourceId: 'RESOURCE-SHARED', resourceName: 'Department', fields: sharedFields, relations: [] }),
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
})
