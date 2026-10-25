// Evidence only: observes existing browser traffic through cua_repl CDP.
// Never issues application API requests or reads hidden application state.
import {writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const methods = ['Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFinished', 'Network.loadingFailed']
const queryPath = '/api/DataOperation/GetData'
const rowFields = {
  _Base_DictType: ['rowid', 'TypeName'],
  _Base_DictData: ['rowid', 'typeid', 'val', 'txt', 'ordIdx'],
  Base_InterfaceProvider_Headers: ['rowid', 'providerId', 'type', 'paramName'],
}
function parse(text) {try {return JSON.parse(text)} catch {return undefined}}
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/token|authorization|password|credential|cookie|lingma_sys_/i.test(key)).map(([key, item]) => [key, scrub(item)]))
}
function projectResponse(value, table) {
  const result = typeof value?.Result === 'string' ? parse(value.Result) : value?.Result
  const data = result?.data
  const keys = rowFields[table]
  return {Code: value?.Code, Message: value?.Message, Count: data?.Count,
    Items: keys && Array.isArray(data?.Items) ? data.Items.map(row => Object.fromEntries(keys.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]))) : []}
}
export class SelectNetworkObserver {
  #cap; #path; #cursor; #records = new Map(); #documents = []; #errors = []; #steps = []
  constructor(cap, path) {this.#cap = cap; this.#path = path}
  async start() {
    await this.#cap.send('Network.enable', {maxTotalBufferSize: 20000000, maxResourceBufferSize: 2000000})
    this.#cursor = (await this.#cap.readEvents({methods, limit: 1000})).cursor
    return this.flush('start')
  }
  async flush(step) {
    for (;;) {
      const batch = await this.#cap.readEvents({afterSequence: this.#cursor, methods, limit: 1000})
      this.#cursor = batch.cursor
      if (batch.truncated) this.#errors.push({step, error: 'event-buffer-truncated'})
      for (const event of batch.events) {
        const data = event.params ?? {}, id = data.requestId
        if (event.method === 'Network.requestWillBeSent') {
          const request = data.request
          if (!request?.url) continue
          const url = new URL(request.url)
          if (data.type === 'Document') this.#documents.push({step, sequence: event.sequence, origin: url.origin, path: url.pathname})
          if (!url.pathname.startsWith('/api/')) continue
          const body = typeof request.postData === 'string' ? parse(request.postData) : undefined
          const table = body?.Table?.[0]?.Name
          this.#records.set(id, {id, step, sequence: event.sequence, path: url.pathname, method: request.method,
            table, request: url.pathname === queryPath ? scrub(body) : undefined})
        } else {
          const record = this.#records.get(id)
          if (!record) continue
          if (event.method === 'Network.responseReceived') record.httpStatus = data.response?.status
          if (event.method === 'Network.loadingFailed') record.failure = data.errorText
          if (event.method === 'Network.loadingFinished') {
            try {
              const response = await this.#cap.send('Network.getResponseBody', {requestId:id})
              const body = response.base64Encoded ? Buffer.from(response.body, 'base64').toString('utf8') : response.body
              const value = parse(body)
              record.responseSha256 = createHash('sha256').update(body).digest('hex')
              record.response = record.path === queryPath ? projectResponse(value, record.table) : {Code: value?.Code, bytes: Buffer.byteLength(body)}
            } catch (error) {record.responseReadError = String(error)}
          }
        }
      }
      if (!batch.hasMore) break
    }
    this.#steps.push({step, time:new Date().toISOString(), requests:this.#records.size})
    await writeFile(this.#path, JSON.stringify({kind:'B1-existing-business-select-SPA', documentLoads:this.#documents, errors:this.#errors, steps:this.#steps, requests:[...this.#records.values()]}, null, 2)+'\n')
    return {step, requests:this.#records.size, documents:this.#documents.length, errors:this.#errors.length,
      nonQuery:[...this.#records.values()].filter(record=>record.path!==queryPath).map(record=>({id:record.id, path:record.path, method:record.method})),
      pending:[...this.#records.values()].filter(record=>!record.response && !record.failure).map(record=>record.id)}
  }
}
