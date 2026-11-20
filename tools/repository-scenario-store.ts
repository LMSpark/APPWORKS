/**
 * 仓内场景开发文件存储模块。
 * 职责：只在已登记资源白名单内安全读取、比较、替换并回读仓库文件。
 * 边界：读写按资源串行；expectedText仅协调本store内操作，不构成外部进程的OS级CAS。仅供Vite开发插件使用。
 */
import {createHash, randomUUID} from 'node:crypto'
import {mkdir, open, lstat, readFile, readdir, realpath, rename, unlink} from 'node:fs/promises'
import path from 'node:path'
import type {RepositoryScenarioFailure, RepositoryScenarioHistoryList, RepositoryScenarioSuccess, RepositoryScenarioVersionSuccess} from '../src/lowcode/resources/repository/scenarios/protocol'

/** 一项由 manifest 登记的仓内场景文件身份；path 必须是 config/pages 下的仓库相对 JSON 路径。 */
export type RepositoryScenarioDescriptor = Readonly<{scenarioId: string; resourceId: string; path: string}>

/**
 * 开发宿主文件存储的根目录、有限资源白名单及可选文件操作适配。
 * 自定义回调仅替换相应存储步骤，不扩大资源白名单或路径范围。
 */
export type RepositoryScenarioStoreOptions = Readonly<{
  root: string
  resources: readonly RepositoryScenarioDescriptor[]
  readBytes?: (filePath: string) => Promise<Buffer>
  beforeReplace?: () => Promise<void>
  replaceFile?: (temporary: string, target: string) => Promise<void>
}>

type StoreFailureInput = Readonly<{
  resourceId: string | null
  outcome: RepositoryScenarioFailure['outcome']
  code: string
  message: string
  status: number
  version?: number
}>
type WriteFailureState = Readonly<{resourceId: string; replacementStarted: boolean}>
type ScenarioTextInput = Readonly<{resource: RepositoryScenarioDescriptor; text: string}>

/** 含 HTTP 状态和协议失败 DTO 的存储错误，供开发中间件原样映射为响应。 */
export class RepositoryScenarioStoreError extends Error {
  constructor(readonly response: RepositoryScenarioFailure, readonly status: number) {
    super(response.message)
    this.name = 'RepositoryScenarioStoreError'
  }
}

/**
 * 仅服务已登记仓内场景资源的开发文件存储器。
 * 同一资源的读取和写入串行化，保证本存储器内的读写顺序；expectedText 比较不是对外部进程的操作系统级 CAS。
 */
export class RepositoryScenarioStore {
  readonly #root: string
  readonly #resources: ReadonlyMap<string, RepositoryScenarioDescriptor>
  readonly #queues = new Map<string, Promise<void>>()
  readonly #readBytes: (filePath: string) => Promise<Buffer>
  readonly #beforeReplace: () => Promise<void>
  readonly #replaceFile: (temporary: string, target: string) => Promise<void>

  constructor(options: RepositoryScenarioStoreOptions) {
    this.#root = path.resolve(options.root)
    this.#resources = new Map(options.resources.map(resource => [resource.resourceId, resource]))
    this.#readBytes = options.readBytes ?? (filePath => readFile(filePath))
    this.#beforeReplace = options.beforeReplace ?? (() => Promise.resolve())
    this.#replaceFile = options.replaceFile ?? rename
    const scenarioIds = new Set(options.resources.map(resource => resource.scenarioId))
    const paths = new Set(options.resources.map(resource => resource.path))
    if (this.#resources.size !== options.resources.length || scenarioIds.size !== options.resources.length
      || paths.size !== options.resources.length || options.resources.some(resource => !resource.resourceId
        || resource.resourceId !== `repository:scenario-view:${resource.scenarioId}` || !resource.scenarioId
        || !isSafeScenarioId(resource.scenarioId) || !isRegisteredPath(resource.path))) {
      throw new Error('REPOSITORY_SCENARIO_MANIFEST_INVALID: 仓内场景白名单无效')
    }
  }

  /** 每次从当前仓内文件读取新鲜文本并生成 SHA-256 修订值；不使用模块缓存。 */
  async read(resourceId: string): Promise<RepositoryScenarioSuccess> {
    const resource = this.#resource(resourceId)
    return this.#withResourceQueue(resourceId, async () => toResponse(resource, await this.#readText(resource)))
  }

  /** 以 expectedText 比较当前文件，验证场景身份后替换并回读；替换开始后的错误按未知结果返回。 */
  async write(resourceId: string, text: string, expectedText: string): Promise<RepositoryScenarioSuccess> {
    const resource = this.#resource(resourceId)
    return this.#withResourceQueue(resourceId, () => this.#write(resource, text, expectedText))
  }

  /** 只读枚举config/history下实际存在的不可变快照；缺目录表示空列表，不创建目录。 */
  async listVersions(resourceId: string): Promise<RepositoryScenarioHistoryList> {
    const resource = this.#resource(resourceId)
    return this.#withResourceQueue(resourceId, async () => {
      const directory = await this.#safeHistoryDirectory(resource, false)
      if (directory === null) return {resourceId, scenarioId: resource.scenarioId, versions: []}
      let entries
      try { entries = await readdir(directory, {withFileTypes: true}) }
      catch (error) {
        if (errorCode(error) === 'ENOENT') return {resourceId, scenarioId: resource.scenarioId, versions: []}
        throw failure({resourceId, outcome: 'unknown', code: 'REPOSITORY_SCENARIO_HISTORY_READ_FAILED', message: errorMessage(error), status: 500})
      }
      const versions: Array<{version: number; fileName: string; lastModified: number | null}> = []
      for (const entry of entries) {
        const match = /^(0|[1-9]\d*)__pagedata\.json$/u.exec(entry.name)
        if (!match) continue
        const version = Number(match[1])
        if (!Number.isSafeInteger(version)) throw failure({resourceId, outcome: 'unknown',
          code: 'REPOSITORY_SCENARIO_HISTORY_INVALID', message: '仓内场景历史目录包含无效快照文件', status: 500})
        if (!entry.isFile()) {
          throw failure({resourceId, outcome: 'unknown',
            code: 'REPOSITORY_SCENARIO_HISTORY_INVALID', message: '仓内场景历史目录包含无效快照文件', status: 500, version})
        }
        const target = await this.#safeHistoryFile(resource, version)
        const info = await lstat(target)
        versions.push({version, fileName: entry.name, lastModified: Number.isFinite(info.mtimeMs) ? info.mtimeMs : null})
      }
      versions.sort((left, right) => left.version - right.version)
      return {resourceId, scenarioId: resource.scenarioId, versions}
    })
  }

  /** 读取一个精确编号的历史原文，不接纳或写回活动文件。 */
  async readVersion(resourceId: string, version: number): Promise<RepositoryScenarioVersionSuccess> {
    const resource = this.#resource(resourceId)
    this.#assertVersion(resourceId, version)
    return this.#withResourceQueue(resourceId, async () => {
      const fileName = `${version}__pagedata.json`
      const text = await this.#readHistoryText(resource, version)
      return {resourceId, scenarioId: resource.scenarioId, version, fileName, text,
        sourceRevision: createHash('sha256').update(text, 'utf8').digest('hex')}
    })
  }

  /** 独占创建预先分配的真实N；冲突只报告not-applied，调用方不得换号重放同一attempt。 */
  async createVersion(command: Readonly<{resourceId: string; version: number; text: string; expectedText: string}>): Promise<RepositoryScenarioVersionSuccess> {
    const {resourceId, version, text, expectedText} = command
    const resource = this.#resource(resourceId)
    this.#assertVersion(resourceId, version)
    return this.#withResourceQueue(resourceId, async () => {
      if (typeof text !== 'string' || typeof expectedText !== 'string') throw failure({resourceId, outcome: 'not-applied',
        code: 'REPOSITORY_SCENARIO_REQUEST_INVALID', message: '历史快照原文或活动文件基线无效', status: 400, version})
      assertScenarioText({resource, text})
      let current: string
      try { current = decode(await this.#readBytes(await this.#safePath(resource))) }
      catch (error) {throw failure({resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_READ_FAILED', message: errorMessage(error), status: 500, version})}
      if (current !== expectedText) throw failure({resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_CONFLICT',
        message: '仓内活动场景原文已改变', status: 409, version})
      if (text !== expectedText) throw failure({resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_VERSION_BASELINE_MISMATCH',
        message: '历史快照原文必须与已保存活动文件一致', status: 409, version})
      let directory: string | null
      try {directory = await this.#safeHistoryDirectory(resource, true)}
      catch (error) {
        if (error instanceof RepositoryScenarioStoreError && error.response.version === undefined) {
          throw failure({...error.response, status: error.status, version})
        }
        throw error
      }
      if (directory === null) throw new Error('历史快照目录创建失败')
      const target = await this.#safeHistoryFile(resource, version, true)
      let handle: Awaited<ReturnType<typeof open>> | undefined
      try {
        handle = await open(target, 'wx', 0o600)
        await handle.writeFile(text, 'utf8')
        await handle.sync()
        await handle.close(); handle = undefined
        const readback = await this.#readHistoryText(resource, version)
        if (readback !== text) throw new Error('历史快照写入后的原文回读不一致')
        return {resourceId, scenarioId: resource.scenarioId, version, fileName: `${version}__pagedata.json`, text: readback,
          sourceRevision: createHash('sha256').update(readback, 'utf8').digest('hex')}
      } catch (error) {
        if (handle) await handle.close().catch(() => undefined)
        if (errorCode(error) === 'EEXIST') throw failure({resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_VERSION_CONFLICT',
          message: `场景快照编号 ${version} 已存在`, status: 409, version})
        throw failure({resourceId, outcome: 'unknown', code: 'REPOSITORY_SCENARIO_VERSION_UNKNOWN',
          message: errorMessage(error), status: 500, version})
      }
    })
  }

  async #write(resource: RepositoryScenarioDescriptor, text: string, expectedText: string): Promise<RepositoryScenarioSuccess> {
    if (typeof text !== 'string' || typeof expectedText !== 'string') {
      throw failure({resourceId: resource.resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_REQUEST_INVALID',
        message: '场景文本或预期原文无效', status: 400})
    }
    assertScenarioText({resource, text})
    let target: string
    try { target = await this.#safePath(resource) }
    catch (error) {
      if (error instanceof RepositoryScenarioStoreError) throw error
      throw failure({resourceId: resource.resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_PATH_INVALID',
        message: errorMessage(error), status: 404})
    }
    let current: string
    try { current = decode(await this.#readBytes(target)) }
    catch (error) {
      throw failure({resourceId: resource.resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_READ_FAILED',
        message: errorMessage(error), status: 500})
    }
    if (current !== expectedText) {
      throw failure({resourceId: resource.resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_CONFLICT',
        message: '仓内场景原文已改变', status: 409})
    }

    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`)
    const stage: {replacementStarted: boolean; primaryError?: unknown} = {replacementStarted: false}
    try {
      const handle = await open(temporary, 'wx', 0o600)
      try { await handle.writeFile(text, 'utf8'); await handle.sync() }
      finally { await handle.close() }
      await this.#safePath(resource)
      await this.#beforeReplace()
      stage.replacementStarted = true
      await this.#replaceFile(temporary, target)
      const readback = await this.#readText(resource)
      if (readback !== text) throw new Error('仓内场景替换后的原文回读不一致')
      return toResponse(resource, readback)
    } catch (error) {
      stage.primaryError = error
      throw writeFailure({resourceId: resource.resourceId, replacementStarted: stage.replacementStarted}, error)
    } finally {
      try { await unlink(temporary) }
      catch (error) {
        if (errorCode(error) !== 'ENOENT' && stage.primaryError === undefined) {
          throw writeFailure({resourceId: resource.resourceId, replacementStarted: stage.replacementStarted}, error)
        }
      }
    }
  }

  #resource(resourceId: string): RepositoryScenarioDescriptor {
    const resource = this.#resources.get(resourceId)
    if (!resource) throw failure({resourceId: resourceId || null, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_RESOURCE_UNKNOWN',
      message: '仓内场景资源未登记', status: 404})
    return resource
  }

  async #readText(resource: RepositoryScenarioDescriptor): Promise<string> {
    try { return decode(await this.#readBytes(await this.#safePath(resource))) }
    catch (error) {
      if (error instanceof RepositoryScenarioStoreError) throw error
      throw failure({resourceId: resource.resourceId, outcome: 'unknown', code: 'REPOSITORY_SCENARIO_READ_FAILED',
        message: errorMessage(error), status: 500})
    }
  }

  async #safePath(resource: RepositoryScenarioDescriptor): Promise<string> {
    if (!isRegisteredPath(resource.path)) throw failure({resourceId: resource.resourceId, outcome: 'not-applied',
      code: 'REPOSITORY_SCENARIO_PATH_INVALID', message: '仓内场景路径无效', status: 400})
    const root = await realpath(this.#root)
    let current = root
    for (const segment of resource.path.split('/')) {
      current = path.join(current, segment)
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw failure({resourceId: resource.resourceId, outcome: 'not-applied',
        code: 'REPOSITORY_SCENARIO_PATH_LINK', message: '仓内场景路径不能包含符号链接', status: 403})
    }
    const resolved = await realpath(current)
    if (!isWithin(root, resolved)) throw failure({resourceId: resource.resourceId, outcome: 'not-applied',
      code: 'REPOSITORY_SCENARIO_PATH_ESCAPE', message: '仓内场景路径越出仓库目录', status: 403})
    return resolved
  }

  async #safeHistoryDirectory(resource: RepositoryScenarioDescriptor, create: boolean): Promise<string | null> {
    const root = await realpath(this.#root)
    const segments = ['config', 'history', 'scenarios', resource.scenarioId]
    let current = root
    for (const segment of segments) {
      current = path.join(current, segment)
      try {
        const info = await lstat(current)
        if (info.isSymbolicLink() || !info.isDirectory()) throw failure({resourceId: resource.resourceId, outcome: 'not-applied',
          code: 'REPOSITORY_SCENARIO_PATH_LINK', message: '仓内场景历史路径必须是普通目录', status: 403})
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error
        if (!create) return null
        try { await mkdir(current) }
        catch (mkdirError) {if (errorCode(mkdirError) !== 'EEXIST') throw mkdirError}
        const info = await lstat(current)
        if (info.isSymbolicLink() || !info.isDirectory()) throw failure({resourceId: resource.resourceId, outcome: 'not-applied',
          code: 'REPOSITORY_SCENARIO_PATH_LINK', message: '仓内场景历史路径必须是普通目录', status: 403})
      }
      const resolved = await realpath(current)
      if (!isWithin(root, resolved)) throw failure({resourceId: resource.resourceId, outcome: 'not-applied',
        code: 'REPOSITORY_SCENARIO_PATH_ESCAPE', message: '仓内场景历史路径越出仓库目录', status: 403})
    }
    return current
  }

  async #safeHistoryFile(resource: RepositoryScenarioDescriptor, version: number, allowMissing = false): Promise<string> {
    const directory = await this.#safeHistoryDirectory(resource, false)
    if (!directory) throw failure({resourceId: resource.resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_VERSION_MISSING',
      message: '指定的仓内场景历史快照不存在', status: 404, version})
    const target = path.join(directory, `${version}__pagedata.json`)
    try {
      const info = await lstat(target)
      if (info.isSymbolicLink() || !info.isFile()) throw failure({resourceId: resource.resourceId, outcome: 'not-applied',
        code: 'REPOSITORY_SCENARIO_PATH_LINK', message: '仓内场景历史文件必须是普通文件', status: 403, version})
    } catch (error) {
      if (errorCode(error) !== 'ENOENT' || !allowMissing) throw error
    }
    return target
  }

  async #readHistoryText(resource: RepositoryScenarioDescriptor, version: number): Promise<string> {
    const target = await this.#safeHistoryFile(resource, version)
    let text: string
    try {text = decode(await this.#readBytes(target))}
    catch (error) {
      if (errorCode(error) === 'ENOENT') throw failure({resourceId: resource.resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_VERSION_MISSING',
        message: '指定的仓内场景历史快照不存在', status: 404, version})
      throw failure({resourceId: resource.resourceId, outcome: 'unknown', code: 'REPOSITORY_SCENARIO_HISTORY_READ_FAILED', message: errorMessage(error), status: 500, version})
    }
    assertScenarioText({resource, text})
    return text
  }

  #assertVersion(resourceId: string, version: number): void {
    if (!Number.isSafeInteger(version) || version < 0) throw failure({resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_VERSION_INVALID',
      message: '场景快照编号必须为非负安全整数', status: 400})
  }

  async #withResourceQueue<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.#queues.get(key) ?? Promise.resolve()
    let release = (): void => {}
    const current = new Promise<void>(resolve => {release = resolve})
    this.#queues.set(key, current)
    await previous
    try { return await action() }
    finally {
      release()
      if (this.#queues.get(key) === current) this.#queues.delete(key)
    }
  }
}

function toResponse(resource: RepositoryScenarioDescriptor, text: string): RepositoryScenarioSuccess {
  return {resourceId: resource.resourceId, scenarioId: resource.scenarioId, text,
    sourceRevision: createHash('sha256').update(text, 'utf8').digest('hex')}
}

function failure(input: StoreFailureInput): RepositoryScenarioStoreError {
  return new RepositoryScenarioStoreError({resourceId: input.resourceId, outcome: input.outcome,
    code: input.code, message: input.message, ...(input.version === undefined ? {} : {version: input.version})}, input.status)
}

function writeFailure(state: WriteFailureState, error: unknown): RepositoryScenarioStoreError {
  return failure({resourceId: state.resourceId, outcome: state.replacementStarted ? 'unknown' : 'not-applied',
    code: state.replacementStarted ? 'REPOSITORY_SCENARIO_WRITE_UNKNOWN' : 'REPOSITORY_SCENARIO_NOT_APPLIED',
    message: errorMessage(error), status: 500})
}

function assertScenarioText(input: ScenarioTextInput): void {
  let value: unknown
  try { value = JSON.parse(input.text.charCodeAt(0) === 0xFEFF ? input.text.slice(1) : input.text) }
  catch {
    throw failure({resourceId: input.resource.resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_JSON_INVALID',
      message: '仓内场景文本不是有效 JSON', status: 400})
  }
  if (!isRecord(value) || value['scenarioId'] !== input.resource.scenarioId) {
    throw failure({resourceId: input.resource.resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_IDENTITY_INVALID',
      message: '仓内场景文本身份与资源登记不匹配', status: 400})
  }
}

function decode(bytes: Buffer): string {
  try { return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes) }
  catch { throw new Error('仓内场景文件不是有效 UTF-8 文本') }
}

function errorCode(error: unknown): string | undefined { return isRecord(error) && typeof error['code'] === 'string' ? error['code'] : undefined }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : '仓内场景文件操作失败' }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isRegisteredPath(value: string): boolean {
  return value.startsWith('config/pages/') && value.endsWith('.json')
    && !value.includes('..') && !value.includes('\\') && !/[\u0000-\u001f\u007f]/u.test(value)
}
function isSafeScenarioId(value: string): boolean {return /^[A-Za-z0-9_-]+$/u.test(value)}
function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
