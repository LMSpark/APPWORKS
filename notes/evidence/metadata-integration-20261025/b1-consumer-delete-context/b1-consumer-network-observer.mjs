// Verification helper; run only from cua_repl with a documented tab CDP capability.
// Observes existing browser requests. It never issues application API requests.
import {writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'

const methods = ['Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFinished', 'Network.loadingFailed']
const savePath = '/api/DataOperation/BatchTableOperateRequestByCRUD'
const queryPath = '/api/DataOperation/GetData'
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/token|authorization|password|credential|cookie|lingma_sys_/i.test(key)).map(([key, item]) => [key, scrub(item)]))
}
function parsed(text) {try {return JSON.parse(text)} catch {return undefined}}
function envelope(value) {
  if (!value || typeof value !== 'object') return {kind: typeof value}
  return {Code: value.Code, Message: value.Message, ...(Object.hasOwn(value, 'success') ? {success: value.success} : {})}
}
function queryResult(value, dictionaryId, entryQuery) {
  const result = typeof value?.Result === 'string' ? parsed(value.Result) : value?.Result
  const data = result?.data
  const rows = Array.isArray(data?.Items) ? data.Items : []
  return {...envelope(value), Count: data?.Count,
    Items: scrub(rows.filter(row => row.typeid === dictionaryId || row.rowid === 'F9F01665D4A98E1FF996CD8A48D3C373' || row.dataModelId === 'F9F01665D4A98E1FF996CD8A48D3C373' || ['24FAF299D9A22190189C8FE975A2441B','41BC0C6F2D2DC6327B1F7CED01404E56','34E15E3BC4E87AF9CB885BD58696EA80','E2FF72AC90D0BE968E613A3F545CA2F8','5A11E56C5FC8DD593828899C11828DF0','77CDFBD360F6E82554CA4A7094EA80B9','4BE2596650D71A59E02C381B496286C7'].includes(row.rowid)))}
}
function entryTable(body) {return body?.Table?.some(table => table.Name === '_Base_DictData') === true}
function eligible(path) {return path === savePath || path === queryPath || path.startsWith('/api/ai/v1/')}

export class SpaNetworkObserver {
  #cap
  #path
  #dictionaryId
  #cursor
  #records = new Map()
  #documentLoads = []
  #errors = []
  #steps = []
  constructor(capability, evidencePath, dictionaryId) {
    this.#cap = capability
    this.#path = evidencePath
    this.#dictionaryId = dictionaryId
  }
  async start() {
    await this.#cap.send('Network.enable', {maxTotalBufferSize: 20_000_000, maxResourceBufferSize: 2_000_000})
    this.#cursor = (await this.#cap.readEvents({methods, limit: 1000})).cursor
    await this.flush('capture-start')
  }
  async flush(step) {
    for (;;) {
      const batch = await this.#cap.readEvents({afterSequence: this.#cursor, methods, limit: 1000})
      this.#cursor = batch.cursor
      if (batch.truncated) this.#errors.push({step, error: 'network-event-buffer-truncated'})
      for (const event of batch.events) {
        const data = event.params ?? {}
        const id = data.requestId
        if (event.method === 'Network.requestWillBeSent') {
          const request = data.request
          if (!request?.url) continue
          const url = new URL(request.url)
          if (data.type === 'Document') this.#documentLoads.push({step, sequence: event.sequence, origin: url.origin, path: url.pathname})
          if (!eligible(url.pathname)) continue
          const rawBody = typeof request.postData === 'string' ? parsed(request.postData) : undefined
          this.#records.set(id, {id, step, sequence: event.sequence, path: url.pathname, method: request.method,
            request: scrub(rawBody), entryQuery: url.pathname === queryPath && entryTable(rawBody)})
        } else {
          const record = this.#records.get(id)
          if (!record) continue
          if (event.method === 'Network.responseReceived') {
            record.httpStatus = data.response?.status
            record.mimeType = data.response?.mimeType
          }
          if (event.method === 'Network.loadingFailed') record.failure = data.errorText
          if (event.method === 'Network.loadingFinished') {
            try {
              const response = await this.#cap.send('Network.getResponseBody', {requestId: id})
              const body = response.base64Encoded ? Buffer.from(response.body, 'base64').toString('utf8') : response.body
              record.responseSha256 = createHash('sha256').update(body).digest('hex')
              const value = parsed(body)
              record.response = record.path === queryPath ? queryResult(value, this.#dictionaryId, record.entryQuery) : scrub(value)
              if (value === undefined) record.response = {nonJson: true, bytes: Buffer.byteLength(body)}
            } catch (error) {record.responseReadError = String(error)}
          }
        }
      }
      if (!batch.hasMore) break
    }
    this.#steps.push({step, time: new Date().toISOString(), requests: this.#records.size})
    await writeFile(this.#path, JSON.stringify({kind: 'same-SPA-observed-requests', dictionaryId: this.#dictionaryId,
      documentLoads: this.#documentLoads, errors: this.#errors, steps: this.#steps, requests: [...this.#records.values()]}, null, 2) + '\n')
    return {step, requests: this.#records.size, documents: this.#documentLoads.length, errors: this.#errors.length,
      saves: [...this.#records.values()].filter(record => record.path === savePath).length,
      turnCreates: [...this.#records.values()].filter(record => record.path === '/api/ai/v1/turns' && record.method === 'POST').length}
  }
}
