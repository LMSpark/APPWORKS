import { describe, expect, it, vi } from 'vitest'
import { HttpClientBase } from '@spark-appworks/spark-utils'
import type { HttpResponse, RequestConfig } from '@spark-appworks/spark-utils'
import { DataSet } from '../dataset'
import { TreeManager } from '../tree-manager'
import type { FlatTreeNode } from '../types'

const NAV_BASE = '/api/tree/nodes'
const RELATIVE_NAV_BASE = '/tree/nodes'

type TreeHttpMethod = {
  (url: string, dataOrParams?: unknown, config?: Partial<RequestConfig>): Promise<unknown>}

class TreeHttpClient extends HttpClientBase {
  constructor(private readonly methods: Partial<Record<'get' | 'post' | 'put', TreeHttpMethod>>) {
    super({}, 'TreeHttpClient')
  }

  protected async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    const method = config.method ?? 'GET'
    const data = await this.dispatch(method, config)
    return {
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
  private dispatch(method: NonNullable<RequestConfig['method']>, config: RequestConfig): Promise<unknown> {
    switch (method) {
      case 'GET':
        return this.methods.get?.(config.url, config.params, config) ?? Promise.resolve(undefined)
      case 'POST':
        return this.methods.post?.(config.url, config.data, config) ?? Promise.resolve(undefined)
      case 'PUT':
        return this.methods.put?.(config.url, config.data, config) ?? Promise.resolve(undefined)
      case 'PATCH':
      case 'DELETE':
        throw new Error(`Unexpected tree HTTP method: ${method}`)
    }
  }
}

function createTreeHttpClient(methods: Partial<Record<'get' | 'post' | 'put', TreeHttpMethod>>): HttpClientBase {
  return new TreeHttpClient(methods)
}

function createRemoteTreeDataSet(mockHttpClient: HttpClientBase): DataSet {
  const dataSet = DataSet.fromJson({
    dataSetName: 'Tree4Plus7',
    tables: {
      NavigationNodes: {
        tableName: 'NavigationNodes',
        columns: [
          { name: 'id', type: 'number' },
          { name: 'parentId', type: 'number' },
          { name: 'name', type: 'string' },
        ],
        api: {
          list: { url: NAV_BASE, method: 'GET' },
          nested: { url: NAV_BASE, method: 'GET' },
          children: { url: NAV_BASE, method: 'GET' },
          path: { url: `${NAV_BASE}/path/{id}`, method: 'GET' },
          subtree: { url: `${NAV_BASE}/subtree`, method: 'POST' },
          move: { url: `${NAV_BASE}/{id}/move`, method: 'PUT' },
          nestedSearch: { url: `${NAV_BASE}/search`, method: 'GET' },
        },
        views: {
          default: {
            rows: [],
            treeConfig: {
              idField: 'id',
              parentIdField: 'parentId',
              textField: 'name',
            },
          },
        },
      },
    },
  })

  dataSet.setSharedHttpClient(mockHttpClient)
  return dataSet
}

function createScopedRelativeTreeDataSet(mockHttpClient: HttpClientBase): DataSet {
  const dataSet = DataSet.fromJson({
    dataSetName: 'Tree4Plus7ScopedRelative',
    tables: {
      NavigationNodes: {
        tableName: 'NavigationNodes',
        columns: [
          { name: 'id', type: 'number' },
          { name: 'parentId', type: 'number' },
          { name: 'name', type: 'string' },
        ],
        api: {
          list: { url: RELATIVE_NAV_BASE, method: 'GET' },
          nested: { url: RELATIVE_NAV_BASE, method: 'GET' },
          children: { url: RELATIVE_NAV_BASE, method: 'GET' },
          path: { url: `${RELATIVE_NAV_BASE}/path/{id}`, method: 'GET' },
          subtree: { url: `${RELATIVE_NAV_BASE}/subtree`, method: 'POST' },
          move: { url: `${RELATIVE_NAV_BASE}/{id}/move`, method: 'PUT' },
          nestedSearch: { url: `${RELATIVE_NAV_BASE}/search`, method: 'GET' },
        },
        views: {
          default: {
            rows: [],
            treeConfig: {
              idField: 'id',
              parentIdField: 'parentId',
              textField: 'name',
            },
          },
        },
      },
    },
  })

  dataSet.setSharedHttpClient(mockHttpClient)
  dataSet.setAppServices({
    router: {
      currentRoute: {
        params: { tenantId: 'tenant-test', projectId: 'homepage' },
        query: {},
      },
    },
  })
  return dataSet
}

describe('DataSet Tree 4+7 interfaces', () => {
  describe('5 remote interfaces (DataView delegates)', () => {
    it('loadFromServer should call list endpoint for first-screen data and keep treeMode as query signal', async () => {
      const get = vi.fn().mockResolvedValue([
        {
          id: 1,
          parentId: null,
          name: 'Root',
        },
      ])
      const post = vi.fn()
      const dataSet = createRemoteTreeDataSet(createTreeHttpClient({ get, post }))
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()
      view!.treeMode = 'nested'

      const result = await view!.loadFromServer()

      expect(result.success).toBe(true)
      expect(get).toHaveBeenCalledOnce()
      expect(get.mock.calls[0]?.[0]).toBe(NAV_BASE)
      expect(get.mock.calls[0]?.[1]).toEqual({ treeMode: 'nested' })
      expect(view!.rows[0]?.['id']).toBe(1)
    })

    it('loadTreeNested should call nested endpoint for explicit nested contract', async () => {
      const get = vi.fn().mockResolvedValue([
        {
          id: 1,
          parentId: null,
          name: 'Root',
          children: [
            { id: 2, parentId: 1, name: 'Child', children: [] },
          ],
        },
      ])
      const post = vi.fn()
      const dataSet = createRemoteTreeDataSet(createTreeHttpClient({ get, post }))
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      const result = await view!.loadTreeNested()

      expect(result.success).toBe(true)
      expect(get).toHaveBeenCalledOnce()
      expect(get.mock.calls[0]?.[0]).toBe(NAV_BASE)
      expect(get.mock.calls[0]?.[1]).toEqual({ treeMode: 'nested' })
      expect(view!.rows[0]?.['children']).toBeDefined()
    })

    it('loadTreeChildren should call navigation/nodes and return children', async () => {
      const get = vi.fn().mockResolvedValue([
        { id: 1, parentId: null, name: 'Root' },
      ])
      const post = vi.fn()
      const dataSet = createRemoteTreeDataSet(createTreeHttpClient({ get, post }))
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      const rows = await view!.loadTreeChildren(null, 20)

      expect(rows).toHaveLength(1)
      expect(rows[0]?.['name']).toBe('Root')
      expect(get).toHaveBeenCalledOnce()
      expect(get.mock.calls[0]?.[0]).toBe(NAV_BASE)
      expect(get.mock.calls[0]?.[1]).toEqual({ parentId: '', treeMode: 'flat', limit: 20 })
      expect(view!.rows[0]?.['id']).toBe(1)
    })

    it('loadTreeChildren should preserve the configured relative endpoint', async () => {
      const get = vi.fn().mockResolvedValue([
        { id: 1, parentId: null, name: 'Root' },
      ])
      const post = vi.fn()
      const dataSet = createScopedRelativeTreeDataSet(createTreeHttpClient({ get, post }))
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      const rows = await view!.loadTreeChildren(null, 20)

      expect(rows).toHaveLength(1)
      expect(get).toHaveBeenCalledOnce()
      expect(get.mock.calls[0]?.[0]).toBe(RELATIVE_NAV_BASE)
      expect(get.mock.calls[0]?.[1]).toEqual({ parentId: '', treeMode: 'flat', limit: 20 })
    })

    it('loadTreePath should call navigation path endpoint and return pathIds', async () => {
      const get = vi.fn().mockResolvedValue({ pathIds: [1, 2, 3] })
      const post = vi.fn()
      const dataSet = createRemoteTreeDataSet(createTreeHttpClient({ get, post }))
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      const path = await view!.loadTreePath(3)

      expect(path.pathIds).toEqual([1, 2, 3])
      expect(get).toHaveBeenCalledOnce()
      expect(get.mock.calls[0]?.[0]).toBe(`${NAV_BASE}/path/3`)
    })

    it('expandTreeToNode should call navigation path then subtree and skip subtree when cache is complete', async () => {
      const get = vi.fn()
      const post = vi.fn()
      const dataSet = createRemoteTreeDataSet(createTreeHttpClient({ get, post }))
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      get.mockResolvedValueOnce([{ id: 1, parentId: null, name: 'Root' }])
      await view!.loadTreeChildren(null)

      get.mockResolvedValueOnce({ pathIds: [1, 2, 3] })
      post.mockResolvedValueOnce({
        2: { id: 2, parentId: 1, name: 'Child' },
        3: { id: 3, parentId: 2, name: 'Leaf' },
      })
      await view!.expandTreeToNode(3)

      expect(get.mock.calls[1]?.[0]).toBe(`${NAV_BASE}/path/3`)
      expect(post).toHaveBeenCalledOnce()
      expect(post.mock.calls[0]?.[0]).toBe(`${NAV_BASE}/subtree`)
      expect(post.mock.calls[0]?.[1]).toEqual({
        fromId: 1,
        toId: 3,
        treeMode: 'flat',
        includeTargetChildren: true,
      })
      expect(view!.rows.map(row => row['id'])).toEqual([1, 2, 3])

      get.mockResolvedValueOnce({ pathIds: [1, 2, 3] })
      await view!.expandTreeToNode(3)
      expect(post).toHaveBeenCalledTimes(1)
    })

    it('moveTreeNode should call move endpoint and update local rows', async () => {
      const get = vi.fn().mockResolvedValue([
        { id: 1, parentId: null, name: 'Root' },
        { id: 2, parentId: null, name: 'Leaf' },
      ])
      const post = vi.fn()
      const put = vi.fn().mockResolvedValue({ node: { id: 2, parentId: 1, name: 'Leaf' } })
      const dataSet = createRemoteTreeDataSet(createTreeHttpClient({ get, post, put }))
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      await view!.loadFromServer()
      const moved = await view!.moveTreeNode(2, 1, -1)

      expect(put).toHaveBeenCalledOnce()
      expect(put.mock.calls[0]?.[0]).toBe(`${NAV_BASE}/2/move`)
      expect(put.mock.calls[0]?.[1]).toEqual({ newParentId: 1, index: -1 })
      expect(moved?.['parentId']).toBe(1)
    })

    it('moveTreeNode should preserve the configured relative move endpoint', async () => {
      const get = vi.fn().mockResolvedValue([
        { id: 1, parentId: null, name: 'Root' },
        { id: 2, parentId: null, name: 'Leaf' },
      ])
      const post = vi.fn()
      const put = vi.fn().mockResolvedValue({ node: { id: 2, parentId: 1, name: 'Leaf' } })
      const dataSet = createScopedRelativeTreeDataSet(createTreeHttpClient({ get, post, put }))
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      await view!.loadFromServer()
      const moved = await view!.moveTreeNode(2, 1, -1)

      expect(put).toHaveBeenCalledOnce()
      expect(put.mock.calls[0]?.[0]).toBe(`${RELATIVE_NAV_BASE}/2/move`)
      expect(put.mock.calls[0]?.[1]).toEqual({ newParentId: 1, index: -1 })
      expect(moved?.['parentId']).toBe(1)
    })

    it('searchTreeNested should call unified navigation search endpoint and return nested results', async () => {
      const get = vi.fn().mockResolvedValue([
        {
          node: { id: 3, parentId: 2, name: 'Leaf' },
          path: [
            { id: 1, parentId: null, name: 'Root' },
            { id: 2, parentId: 1, name: 'Child' },
            { id: 3, parentId: 2, name: 'Leaf' },
          ],
        },
      ])
      const post = vi.fn()
      const dataSet = createRemoteTreeDataSet(createTreeHttpClient({ get, post }))
      const view = dataSet.getView('NavigationNodes', 'default')
      expect(view).toBeDefined()

      const result = await view!.searchTreeNested('leaf', 10)

      expect(result).toHaveLength(1)
      expect(result[0]?.node['id']).toBe(3)
      expect(get).toHaveBeenCalledOnce()
      expect(get.mock.calls[0]?.[0]).toBe(`${NAV_BASE}/search`)
      expect(get.mock.calls[0]?.[1]).toEqual({ keyword: 'leaf', treeMode: 'flat', limit: 10 })
    })
  })

  describe('7 local interfaces (TreeManager in-memory)', () => {
    const nodes: FlatTreeNode[] = [
      { id: 1, parentId: null, name: 'Root A' },
      { id: 2, parentId: 1, name: 'Child A1' },
      { id: 3, parentId: 1, name: 'Child A2' },
      { id: 4, parentId: 2, name: 'Leaf A1-1' },
      { id: 5, parentId: null, name: 'Root B' },
    ]

    it('getNode should return node by id', () => {
      const tree = new TreeManager({ config: { idField: 'id', parentIdField: 'parentId', textField: 'name' }, initialNodes: nodes })
      expect(tree.getNode(2)?.name).toBe('Child A1')
      expect(tree.getNode(999)).toBeUndefined()
    })

    it('getChildren should return direct children of parent', () => {
      const tree = new TreeManager({ config: { idField: 'id', parentIdField: 'parentId', textField: 'name' }, initialNodes: nodes })
      const children = tree.getChildren(1)
      expect(children.map(item => item.id)).toEqual([2, 3])
    })

    it('getRoots should return top-level nodes', () => {
      const tree = new TreeManager({ config: { idField: 'id', parentIdField: 'parentId', textField: 'name' }, initialNodes: nodes })
      const roots = tree.getRoots()
      expect(roots.map(item => item.id)).toEqual([1, 5])
    })

    it('getNodePath should return pathIds from root to target', () => {
      const tree = new TreeManager({ config: { idField: 'id', parentIdField: 'parentId', textField: 'name' }, initialNodes: nodes })
      const path = tree.getNodePath(4)
      expect(path.pathIds).toEqual([1, 2, 4])
      expect(path.pathNodes?.map(item => item.name)).toEqual(['Root A', 'Child A1', 'Leaf A1-1'])
    })

    it('searchNodes should match keyword by textField (case-insensitive)', () => {
      const tree = new TreeManager({ config: { idField: 'id', parentIdField: 'parentId', textField: 'name' }, initialNodes: nodes })
      const found = tree.searchNodes('child')
      expect(found.map(item => item.id)).toEqual([2, 3])
    })

    it('buildNestedTree should build full nested tree from roots', () => {
      const tree = new TreeManager({ config: { idField: 'id', parentIdField: 'parentId', textField: 'name' }, initialNodes: nodes })
      const nested = tree.buildNestedTree()

      expect(nested).toHaveLength(2)
      expect(nested[0]?.id).toBe(1)
      expect(nested[0]?.children.map(item => item.id)).toEqual([2, 3])
      expect(nested[0]?.children[0]?.children.map(item => item.id)).toEqual([4])
      expect(nested[1]?.id).toBe(5)
    })

    it('buildSubTree should build subtree from specific root', () => {
      const tree = new TreeManager({ config: { idField: 'id', parentIdField: 'parentId', textField: 'name' }, initialNodes: nodes })
      const subtree = tree.buildSubTree(2)

      expect(subtree?.id).toBe(2)
      expect(subtree?.children.map(item => item.id)).toEqual([4])
      expect(tree.buildSubTree(999)).toBeNull()
    })
  })
})
