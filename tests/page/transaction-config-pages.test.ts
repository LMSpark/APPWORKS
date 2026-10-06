import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { compileRule } from '@spark-appworks/spark-project-model'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import { copyOwnEnumerableProperties, readProperty } from '@spark-appworks/spark-utils/internal'
import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { DataSet, isSparkNode, type SparkNode } from '@spark-appworks/spark-data'
import { nodeToActionDescriptor } from '../../packages/spark-component/src/page/actions/node-to-descriptor'
import { executeSaveDataSet } from '../../packages/spark-component/src/page/actions/action-data'
import type { ActionDescriptor, ActionExecutionContext, SaveDataSetAction } from '../../packages/spark-component/src/page/actions/action-types'

const pageRoot = join(process.cwd(), 'backend-api-contracts/characterization-fixtures/pages-config/lmspark/homepage')

const pages: readonly string[] = ['tx-editing-rows', 'tx-transaction-commit', 'tx-transaction-retry']

type CapturedPost = {
  url: string
  data: unknown}

function readPageFile(pageId: string, fileName: string): string {
  return readFileSync(join(pageRoot, pageId, fileName), 'utf8')
}

function readProps(value: unknown): Record<string, unknown> | null {
  const props = readProperty(value, 'props')
  return copyOwnEnumerableProperties(props)
}

function readChildren(value: unknown): unknown[] {
  const children = readProperty(value, 'children')
  return Array.isArray(children) ? children : []
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value !== null && value !== undefined) return value
  throw new Error(message)
}

function requireSaveDataSetAction(descriptor: ActionDescriptor | null, message: string): SaveDataSetAction {
  if (descriptor?.action === 'save-dataset') return descriptor
  throw new Error(message)
}

function readRequestId(data: unknown): string | undefined {
  const requestId = readProperty(data, 'requestId')
  return typeof requestId === 'string' ? requestId : undefined
}

function collectActions(nodes: unknown[]): string[] {
  const actions: string[] = []
  const visit = (node: unknown): void => {
    if (!isSparkNode(node)) return
    const action = readProps(node)?.['action']
    if (typeof action === 'string') actions.push(action)
    for (const child of readChildren(node)) visit(child)
  }
  for (const node of nodes) visit(node)
  return actions
}

function findNodeById(nodes: unknown[], id: string): SparkNode | undefined {
  for (const node of nodes) {
    if (!isSparkNode(node)) continue
    if (readProperty(node, 'id') === id) return node
    const found = findNodeById(readChildren(node), id)
    if (found) return found
  }
  return undefined
}

function readOperations(data: unknown): Array<Record<string, unknown>> {
  const operations = readProperty(data, 'operations')
  if (!Array.isArray(operations)) return []
  return operations.map(copyOwnEnumerableProperties).filter((item): item is Record<string, unknown> => item !== null)
}

class TransactionMockHttpClient extends HttpClientBase {
  constructor(private readonly posts: CapturedPost[]) {
    super({}, 'TransactionMockHttpClient')
  }

  protected async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    if (config.method !== 'POST') {
      throw new Error('unexpected HTTP method')
    }
    this.posts.push({ url: config.url, data: config.data })
    const operations = readOperations(config.data)
    return {
      data: {
        success: true,
        transactionId: 'tx-test-1',
        operationCount: operations.length,
        results: operations.map((operation) => ({
          operationId: typeof operation['operationId'] === 'string' ? operation['operationId'] : undefined,
          status: 'success',
          result: operation['data'] ?? { deleted: true },
        })),
      },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
}

function createMockHttpClient(posts: CapturedPost[]): HttpClientBase {
  return new TransactionMockHttpClient(posts)
}

describe('transaction validation page configs', () => {
  for (const pageId of pages) {
    it(`${pageId} is a zero-code transaction validation page`, () => {
      const pageDataText = readPageFile(pageId, 'pagedata.json')
      const ruleText = readPageFile(pageId, 'rule.json')

      const parsedData = DataSet.fromJson(JSON.parse(pageDataText))
      const compiledRule = compileRule(ruleText)
      const actions = collectActions(compiledRule)

      expect(existsSync(join(pageRoot, pageId, 'script.js'))).toBe(false)
      expect(parsedData.toJson().saveChanges?.mode).toBe('transaction')
      expect(parsedData.toJson().saveChanges?.transaction?.endpoint.url).toBe('/data/transactions')
      expect(compiledRule.length).toBeGreaterThan(0)
      expect(actions).toContain('save-dataset')
      expect(ruleText).not.toContain('"click"')
      expect(ruleText).not.toContain('/data/batch-jobs')
    })
  }

  it('tx-transaction-commit sends parent before child operations through the configured transaction endpoint', async () => {
    const dataSet = DataSet.fromJson(JSON.parse(readPageFile('tx-transaction-commit', 'pagedata.json')))
    dataSet.setPageRoute({ params: { tenantId: 'lmspark', projectId: 'homepage' } })
    const posts: CapturedPost[] = []
    dataSet.setSharedHttpClient(createMockHttpClient(posts))

    const orders = dataSet.getView('SparkTxOrders', 'default')
    const items = dataSet.getView('SparkTxItems', 'default')
    expect(orders).toBeDefined()
    expect(items).toBeDefined()

    await orders!.addRow({ id: 9001, orderNo: 'TX-BE-001', owner: 'Morgan', status: 'draft' })
    await items!.addRow({ id: 9101, orderId: 9001, sku: 'SKU-TX', quantity: 1, status: 'draft' })

    const result = await dataSet.saveChanges()
    expect(result.success).toBe(true)
    expect(posts).toHaveLength(1)
    expect(posts[0]!.url).toBe('/data/transactions')

    const operations = readOperations(posts[0]!.data)
    expect(operations.map((operation) => `${operation['tableName']}:${operation['op']}`)).toEqual([
      'SparkTxOrders:create',
      'SparkTxItems:create',
    ])
    expect(orders!.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(items!.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('tx-transaction-retry conflict button stages a different payload before reusing requestId', async () => {
    const compiledRule = compileRule(readPageFile('tx-transaction-retry', 'rule.json'))
    const conflictButton = requireValue(
      findNodeById(compiledRule, 'btn-save-retry-conflict'),
      'Expected retry conflict button',
    )

    const descriptor = nodeToActionDescriptor(conflictButton)
    expect(descriptor).toMatchObject({
      action: 'append-row',
      dataViewKey: 'SparkTxAudit@default', idField: 'id',
      appendPayload: {
        id: 9202,
        message: 'conflict-submit',
      },
      then: {
        action: 'save-dataset',
        mode: 'transaction',
        requestId: 'tx-config-retry-v1',
      },
    })

    const dataSet = DataSet.fromJson(JSON.parse(readPageFile('tx-transaction-retry', 'pagedata.json')))
    dataSet.setPageRoute({ params: { tenantId: 'lmspark', projectId: 'homepage' } })
    const posts: CapturedPost[] = []
    dataSet.setSharedHttpClient(createMockHttpClient(posts))

    const audit = dataSet.getView('SparkTxAudit', 'default')
    expect(audit).toBeDefined()

    await audit!.addRow({
      id: 9201,
      requestKey: 'tx-config-retry-v1',
      message: 'first-submit',
      status: 'committed',
    })
    await dataSet.saveChanges({ mode: 'transaction', transaction: { requestId: 'tx-config-retry-v1' } })

    await audit!.addRow({
      id: 9202,
      requestKey: 'tx-config-retry-v1',
      message: 'conflict-submit',
      status: 'conflict',
    })
    await dataSet.saveChanges({ mode: 'transaction', transaction: { requestId: 'tx-config-retry-v1' } })

    expect(posts).toHaveLength(2)
    expect(readRequestId(posts[0]!.data)).toBe('tx-config-retry-v1')
    expect(readRequestId(posts[1]!.data)).toBe('tx-config-retry-v1')

    const firstOperations = readOperations(posts[0]!.data)
    const secondOperations = readOperations(posts[1]!.data)
    expect(firstOperations).toHaveLength(1)
    expect(secondOperations).toHaveLength(1)
    expect(firstOperations[0]!['data']).toMatchObject({ message: 'first-submit' })
    expect(secondOperations[0]!['data']).toMatchObject({ message: 'conflict-submit' })
    expect(JSON.stringify(firstOperations)).not.toBe(JSON.stringify(secondOperations))
  })

  it('save-dataset supports zero-code auto requestId while fixed requestId keeps priority', async () => {
    const autoNode: SparkNode = {
      type: 'r-button',
      props: {
        action: 'save-dataset',
        scenarioId: 'local-transaction-fixture',
        mode: 'transaction',
        requestIdStrategy: 'auto',
      },
    }
    const autoDescriptor = nodeToActionDescriptor(autoNode)
    expect(autoDescriptor).toMatchObject({
      action: 'save-dataset',
      mode: 'transaction',
      requestIdStrategy: 'auto',
    })

    const fixedDescriptor = nodeToActionDescriptor({
      type: 'r-button',
      props: {
        action: 'save-dataset',
        mode: 'transaction',
        requestId: 'fixed-request-id',
        requestIdStrategy: 'auto',
      },
    })
    expect(fixedDescriptor).toMatchObject({
      action: 'save-dataset',
      mode: 'transaction',
      requestId: 'fixed-request-id',
      requestIdStrategy: 'auto',
    })

    const dataSet = DataSet.fromJson(JSON.parse(readPageFile('tx-transaction-commit', 'pagedata.json')))
    dataSet.setPageRoute({ params: { tenantId: 'lmspark', projectId: 'homepage' } })
    const posts: CapturedPost[] = []
    dataSet.setSharedHttpClient(createMockHttpClient(posts))

    const orders = dataSet.getView('SparkTxOrders', 'default')
    expect(orders).toBeDefined()
    await orders!.addRow({ id: 9301, orderNo: 'TX-AUTO-001', owner: 'River', status: 'draft' })

    const messages: Array<{ type: string; message: string }> = []
    const ctx: ActionExecutionContext = {
      getDataSet: scenarioId => scenarioId === 'local-transaction-fixture' ? dataSet : null,
      resolveView: binding => {const [table, view = 'default'] = binding.split('@'); return table ? dataSet.getView(table, view) ?? null : null},
      getPageService: () => ({
        showMessage: (message, type = 'info') => {
          messages.push({ type, message })
        },
        showConfirm: vi.fn(async () => true),
        showPrompt: vi.fn(async () => null),
        showAlert: vi.fn(async () => undefined),
        showDialog: vi.fn(async (): Promise<'cancel'> => 'cancel'),
        selectEntities: vi.fn(async () => []),
        browseFiles: vi.fn(async () => []),
        uploadFiles: vi.fn(async () => []),
        showLoading: vi.fn(),
        navigate: vi.fn(),
      }),
      getRouter: () => null,
    }

    await executeSaveDataSet(requireSaveDataSetAction(autoDescriptor, 'Expected save-dataset descriptor'), ctx)

    expect(messages.at(-1)?.type).toBe('success')
    expect(posts).toHaveLength(1)
    const requestId = readRequestId(posts[0]!.data)
    expect(requestId).toBeDefined()
    expect(requestId).not.toBe('fixed-request-id')
    expect(requireValue(requestId, 'Expected auto requestId').length).toBeGreaterThan(10)
  })
})
