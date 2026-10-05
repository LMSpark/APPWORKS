import { describe, expect, it, vi } from 'vitest'
import { createRequest } from '@spark-appworks/spark-utils'
import { SparkData } from '../spark-data'
import { CrudService } from '../crud-service'

describe('database CrudApi helper', () => {
  it('creates standard metadata-driven CRUD and tree endpoints', () => {
    const api = SparkData.createDatabaseCrudApi('Orders')

    expect(api.list).toEqual({ url: '/data/Orders/query', method: 'POST' })
    expect(api.create).toEqual({ url: '/data/Orders/records', method: 'POST' })
    expect(api.retrieve).toEqual({ url: '/data/Orders/records/get', method: 'POST' })
    expect(api.update).toEqual({ url: '/data/Orders/records/update', method: 'POST' })
    expect(api.delete).toEqual({ url: '/data/Orders/records/delete', method: 'POST' })
    expect(api.batch?.create).toEqual({ url: '/data/Orders/records/batch-create', method: 'POST' })
    expect(api.children).toEqual({ url: '/data/Orders/tree/children', method: 'POST' })
    expect(api.nestedSearch).toEqual({ url: '/data/Orders/tree/nested/search', method: 'POST' })
  })

  it('lets retrieve use POST for database metadata endpoints', async () => {
    const api = SparkData.createDatabaseCrudApi('Orders')
    const mockClient = createRequest()
    const getMock = vi.spyOn(mockClient, 'get').mockResolvedValue({})
    const postMock = vi.spyOn(mockClient, 'post').mockResolvedValue({ id: 1, name: 'Order 1' })
    const service = new CrudService(api, mockClient, () => ({ tenantId: 't1', projectId: 'p1' }))

    const result = await service.retrieve({ id: 1 })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ id: 1, name: 'Order 1' })
    expect(postMock).toHaveBeenCalledWith('/data/Orders/records/get', { id: 1 }, { headers: {} })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('uses the HTTP client business entity as the create result', async () => {
    const api = SparkData.createDatabaseCrudApi('Orders')
    const mockClient = createRequest()
    const postMock = vi.spyOn(mockClient, 'post').mockResolvedValue({ id: 2, name: 'Order 2' })
    const service = new CrudService(api, mockClient)

    const result = await service.create({ name: 'Order 2' })

    expect(result).toEqual({ success: true, data: { id: 2, name: 'Order 2' } })
    expect(postMock).toHaveBeenCalledWith('/data/Orders/records', { name: 'Order 2' }, { headers: {} })
  })
})
