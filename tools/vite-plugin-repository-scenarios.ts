/**
 * Vite开发宿主的仓内场景端点模块。
 * 职责：把有限资源请求交给repository store，并限制真实监听地址、请求peer及来源。
 * 边界：仅serve注册，必须是实际loopback监听和loopback连接；production build及preview不挂载该端点。
 */
import type {IncomingMessage, ServerResponse} from 'node:http'
import {resolve} from 'node:path'
import {isIP} from 'node:net'
import {TLSSocket} from 'node:tls'
import {normalizePath, type Plugin, type ViteDevServer} from 'vite'
import {RepositoryScenarioStore, RepositoryScenarioStoreError, type RepositoryScenarioDescriptor} from './repository-scenario-store'
import {isNonnegativeSafeInteger, REPOSITORY_SCENARIO_ENDPOINT} from '../src/lowcode/resources/shared/repository-scenarios/repository-scenario-protocol'

const maximumBodyBytes = 1024 * 1024

/** 开发宿主插件所需的仓库根路径与受限场景资源登记。 */
export type RepositoryScenarioPluginOptions = Readonly<{root: string; resources: readonly RepositoryScenarioDescriptor[]}>

/**
 * 注册仅用于 Vite serve 的仓内场景文件端点。
 * 每个请求都核实际 loopback 监听地址和 loopback peer；本插件不进入 production build 或 preview。
 */
export function repositoryScenarioPlugin(options: RepositoryScenarioPluginOptions): Plugin {
  const store = new RepositoryScenarioStore({root: options.root, resources: options.resources})
  const scenarioPaths = new Set(options.resources.map(resource => normalizePath(resolve(options.root, resource.path))))
  return {
    name: 'spark:repository-scenarios',
    apply: 'serve',
    hotUpdate: {
      order: 'post',
      handler({file}) {
        return scenarioPaths.has(normalizePath(resolve(file))) ? [] : undefined
      },
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url
        if (typeof url !== 'string' || (!url.startsWith(`${REPOSITORY_SCENARIO_ENDPOINT}?`) && url !== REPOSITORY_SCENARIO_ENDPOINT)) {
          next(); return
        }
        void handleRequest({server, store, request, response})
      })
    },
  }
}

type HandleRequestInput = Readonly<{server: ViteDevServer; store: RepositoryScenarioStore; request: IncomingMessage; response: ServerResponse}>
async function handleRequest(input: HandleRequestInput): Promise<void> {
  const {server, store, request, response} = input
  let resourceId: string | null = null
  try {
    const listener = server.httpServer?.address()
    if (listener === undefined || listener === null || typeof listener === 'string' || !isLoopback(listener.address)
      || !isLoopback(request.socket.remoteAddress ?? '')) {
      throw responseError({status: 403, code: 'REPOSITORY_SCENARIO_LOOPBACK_REQUIRED',
        message: '仓内文件端点仅允许 loopback 监听和连接'})
    }
    validateHost(request, listener.port)
    const requestUrl = new URL(request.url ?? '', `http://localhost:${listener.port}`)
    if (requestUrl.pathname !== REPOSITORY_SCENARIO_ENDPOINT) {response.statusCode = 404; response.end(); return}

    if (request.method === 'GET') {
      validateOrigin({request, port: listener.port, required: false})
      const resources = requestUrl.searchParams.getAll('resourceId')
      resourceId = resources.length === 1 ? resources[0] ?? null : null
      if (!resourceId) {
        throw responseError({status: 400, code: 'REPOSITORY_SCENARIO_REQUEST_INVALID', message: '仓内场景读取请求无效'})
      }
      const requestedResourceId = resourceId
      if (requestUrl.searchParams.size === 1 && requestUrl.searchParams.has('resourceId')) {
        sendJson(response, 200, await store.read(requestedResourceId)); return
      }
      if (requestUrl.searchParams.size === 2 && requestUrl.searchParams.getAll('history').length === 1
        && requestUrl.searchParams.get('history') === 'list') {
        sendJson(response, 200, await store.listVersions(requestedResourceId)); return
      }
      const versionValues = requestUrl.searchParams.getAll('version')
      const rawVersion = versionValues.length === 1 ? versionValues[0] ?? null : null
      if (requestUrl.searchParams.size === 2 && rawVersion !== null && /^(0|[1-9]\d*)$/u.test(rawVersion)) {
        const version = Number(rawVersion)
        if (!Number.isSafeInteger(version)) throw responseError({status: 400, code: 'REPOSITORY_SCENARIO_REQUEST_INVALID', message: '场景历史编号无效'})
        sendJson(response, 200, await store.readVersion(requestedResourceId, version)); return
      }
      throw responseError({status: 400, code: 'REPOSITORY_SCENARIO_REQUEST_INVALID', message: '仓内场景读取请求无效'})
    }
    if (request.method !== 'POST') {
      throw responseError({status: 405, code: 'REPOSITORY_SCENARIO_METHOD_INVALID', message: '仓内场景端点只支持 GET 和 POST'})
    }
    validateOrigin({request, port: listener.port, required: true})
    const body = await readJsonBody(request)
    if (typeof body['resourceId'] !== 'string') throw responseError({status: 400, code: 'REPOSITORY_SCENARIO_REQUEST_INVALID', message: '仓内场景保存请求无效'})
    resourceId = body['resourceId']
    if (body['operation'] === 'create-version') {
      const version = body['version'], text = body['text'], expectedText = body['expectedText']
      if (!isNonnegativeSafeInteger(version) || typeof text !== 'string' || typeof expectedText !== 'string') {
        throw responseError({status: 400, code: 'REPOSITORY_SCENARIO_REQUEST_INVALID', message: '仓内场景历史创建请求无效'})
      }
      sendJson(response, 200, await store.createVersion({resourceId, version, text, expectedText}))
      return
    }
    if (body['operation'] !== undefined || typeof body['text'] !== 'string' || typeof body['expectedText'] !== 'string') {
      throw responseError({status: 400, code: 'REPOSITORY_SCENARIO_REQUEST_INVALID', message: '仓内场景保存请求无效'})
    }
    sendJson(response, 200, await store.write(resourceId, body['text'], body['expectedText']))
  } catch (error) {
    if (response.headersSent || response.destroyed) return
    if (error instanceof RepositoryScenarioStoreError) {
      sendJson(response, error.status, error.response)
      return
    }
    const status = error instanceof HttpRequestError ? error.status : 500
    const outcome = error instanceof HttpRequestError || resourceId === null ? 'not-applied' : 'unknown'
    const code = error instanceof HttpRequestError ? error.code : 'REPOSITORY_SCENARIO_WRITE_UNKNOWN'
    sendJson(response, status, {resourceId, outcome, code, message: errorMessage(error)})
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new HttpRequestError({status: 415, code: 'REPOSITORY_SCENARIO_CONTENT_TYPE', message: '请求必须为 application/json'})
  const contentLength = request.headers['content-length']
  if (contentLength !== undefined && (!/^\d+$/u.test(contentLength) || Number(contentLength) > maximumBodyBytes)) {
    request.resume()
    throw new HttpRequestError({status: 413, code: 'REPOSITORY_SCENARIO_BODY_TOO_LARGE', message: '请求体超过 1 MiB'})
  }
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = requestChunkBytes(chunk)
    if (!bytes) throw new HttpRequestError({status: 400, code: 'REPOSITORY_SCENARIO_BODY_INVALID', message: '请求体分块无效'})
    size += bytes.byteLength
    if (size > maximumBodyBytes) {
      request.resume()
      throw new HttpRequestError({status: 413, code: 'REPOSITORY_SCENARIO_BODY_TOO_LARGE', message: '请求体超过 1 MiB'})
    }
    chunks.push(bytes)
  }
  let value: unknown
  try {
    const decoded = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(Buffer.concat(chunks))
    value = JSON.parse(decoded.charCodeAt(0) === 0xFEFF ? decoded.slice(1) : decoded)
  } catch {
    throw new HttpRequestError({status: 400, code: 'REPOSITORY_SCENARIO_JSON_INVALID', message: '请求体不是有效 UTF-8 JSON'})
  }
  if (!isRecord(value)) {
    throw new HttpRequestError({status: 400, code: 'REPOSITORY_SCENARIO_JSON_INVALID', message: '请求体必须是 JSON 对象'})
  }
  return value
}

function requestChunkBytes(value: unknown): Uint8Array | null {
  if (typeof value === 'string') return new TextEncoder().encode(value)
  if (!ArrayBuffer.isView(value)) return null
  return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
}

function validateHost(request: IncomingMessage, port: number): void {
  const host = request.headers.host
  if (!host || !isAllowedAuthority(host, port)) {
    throw responseError({status: 403, code: 'REPOSITORY_SCENARIO_HOST_INVALID', message: 'Host 不属于当前 loopback 开发服务'})
  }
}

type OriginPolicyInput = Readonly<{request: IncomingMessage; port: number; required: boolean}>
function validateOrigin(input: OriginPolicyInput): void {
  const {request, port, required} = input
  const origin = request.headers.origin, fetchSite = request.headers['sec-fetch-site']
  if (fetchSite === 'cross-site') {
    throw responseError({status: 403, code: 'REPOSITORY_SCENARIO_ORIGIN_INVALID', message: '拒绝跨站仓内场景请求'})
  }
  if (origin === undefined && !required) return
  if (!origin) throw responseError({status: 403, code: 'REPOSITORY_SCENARIO_ORIGIN_INVALID', message: '保存请求必须包含同源 Origin'})
  let url: URL
  try { url = new URL(origin) }
  catch { throw responseError({status: 403, code: 'REPOSITORY_SCENARIO_ORIGIN_INVALID', message: 'Origin 无效'}) }
  const host = request.headers.host ?? ''
  const hostUrl = actualHostUrl(request, host)
  if (url.protocol !== hostUrl.protocol || url.origin !== hostUrl.origin || !isAllowedAuthority(host, port)) {
    throw responseError({status: 403, code: 'REPOSITORY_SCENARIO_ORIGIN_INVALID', message: 'Origin 与 loopback 服务不匹配'})
  }
}

function actualHostUrl(request: IncomingMessage, host: string): URL {
  const protocol = request.socket instanceof TLSSocket ? 'https:' : 'http:'
  try { return new URL(`${protocol}//${host}`) }
  catch { throw responseError({status: 403, code: 'REPOSITORY_SCENARIO_HOST_INVALID', message: 'Host 无效'}) }
}

function isAllowedAuthority(authority: string, port: number): boolean {
  let url: URL
  try { url = new URL(`http://${authority}`) }
  catch { return false }
  return url.username === '' && url.password === '' && url.pathname === '/' && url.search === '' && url.hash === ''
    && isLoopbackHost(url.hostname) && url.port === String(port)
}

function isLoopback(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/gu, '')
  if (normalized === '::1') return true
  const mapped = normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized
  return isIP(mapped) === 4 && Number(mapped.split('.')[0]) === 127
}

function isLoopbackHost(host: string): boolean { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host.toLowerCase()) }
function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}
type HttpRequestErrorInput = Readonly<{status: number; code: string; message: string}>
function responseError(input: HttpRequestErrorInput): HttpRequestError {
  return new HttpRequestError(input)
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : '仓内场景端点失败' }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }

class HttpRequestError extends Error {
  constructor(readonly input: HttpRequestErrorInput) { super(input.message) }
  get status(): number { return this.input.status }
  get code(): string { return this.input.code }
}
