import { DataSpaceQueryContext } from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import { DataSpaceQueryTable } from '../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runtimeQuery, readRequestScope } = vi.hoisted(() => ({
  runtimeQuery: vi.fn(),
  readRequestScope: vi.fn(() => ({ token: 'scope-a', headers: { 'X-AppId': 'app-a' } })),
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {
    readRequestScope,
    dataSpace: { runtime: { query: runtimeQuery } },
  },
}))

import { LowcodeDataSpaceCatalog } from '@/lowcode/data-space/lowcode-data-space-catalog'
import DataSpaceCatalogPage from '@/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue'

type ContextOptions = Readonly<{ total?: number; countReported?: boolean; metaName?: string; primaryKey?: string }>

function context(rows: readonly Record<string, unknown>[], options: ContextOptions = {}): DataSpaceQueryContext {
  const { total = 1, countReported = true, metaName = 'Base_DataSet' } = options
  const primaryKey = options.primaryKey ?? (metaName === 'Base_UserInfo' ? 'ID' : 'rowid')
  const table = new DataSpaceQueryTable({ scenarioId: 'SCENE', metaName })
  const result = { Result: { data: { Count: countReported ? total : undefined, Items: rows, hasNextPage: false, Action: [] },
    primaryKeyField: primaryKey, allowAdd: false } }
  return new DataSpaceQueryContext({ identity: table.identity, snapshot: table.applyResult(result), scope: 'scope-a', readScope: () => 'scope-a' })
}

function firstRuntimeCall() {
  const call = runtimeQuery.mock.calls[0]
  if (call === undefined) throw new Error('Expected a catalog query')
  return call
}

function lastRuntimeCall() {
  const call = runtimeQuery.mock.calls.filter(call => call[0]?.metaName === 'Base_DataSet').at(-1)
  if (call === undefined) throw new Error('Expected a catalog query')
  return call
}

function listRuntimeCalls() {
  return runtimeQuery.mock.calls.filter(call => call[0]?.metaName === 'Base_DataSet')
}

function mockByMetaName(data: DataSpaceQueryContext, apps = context([{ rowid: 'APP-1', AppDesc: 'App One' }], { metaName: 'Base_AppSystemList' }),
  users = context([], { total: 0, metaName: 'Base_UserInfo' })) {
  runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => Promise.resolve(
    identity.metaName === 'Base_AppSystemList' ? apps : identity.metaName === 'Base_UserInfo' ? users : data,
  ))
}

function mockListFlightsByMetaName(dataQuery: () => Promise<DataSpaceQueryContext>, apps = context([{ rowid: 'APP-1', AppDesc: 'App One' }], { metaName: 'Base_AppSystemList' }),
  users = context([], { total: 0, metaName: 'Base_UserInfo' })) {
  runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => identity.metaName === 'Base_AppSystemList'
    ? Promise.resolve(apps) : identity.metaName === 'Base_UserInfo' ? Promise.resolve(users) : dataQuery())
}

describe('LowcodeDataSpaceCatalog', () => {
  beforeEach(() => {
    runtimeQuery.mockReset()
    readRequestScope.mockReset()
    readRequestScope.mockReturnValue({ token: 'scope-a', headers: { 'X-AppId': 'app-a' } })
  })

  it('uses only the supplied scenario and sends the name OR rowid query with descending server pagination', async () => {
    const queryContext = context([{ rowid: 'ROW-1', Name: 'Invoices', Type: 'datasource' }], { total: 12 })
    runtimeQuery.mockResolvedValue(queryContext)
    const catalog = new LowcodeDataSpaceCatalog('SCENE')

    const queryInput = { name: '  ROW-1 ', sysid: ' APP-1 ', page: 2, pageSize: 5 }
    const result = await catalog.query(queryInput)

    expect(listRuntimeCalls()).toHaveLength(1)
    const [identity, options] = firstRuntimeCall()
    expect(identity).toEqual({ scenarioId: 'SCENE', metaName: 'Base_DataSet' })
    expect(options.filter.toJSON()).toEqual({ logic: 'and', filters: [
      { logic: 'or', filters: [
        { field: 'Name', operator: 'contains', value: 'ROW-1' },
        { field: 'rowid', operator: 'eq', value: 'ROW-1' },
      ] },
      { field: 'sysid', operator: 'eq', value: 'APP-1' },
    ] })
    expect(options.sort).toEqual([{ field: 'createtime', direction: 'desc' }])
    expect(options.page).toEqual({ index: 2, size: 5 })
    const wireRequest = new DataSpaceQueryTable(identity).buildRequest(options)
    const wireFields = wireRequest.Table[0]?.['Fields']
    expect(wireFields).toEqual([
      { Name: 'rowid', IsOutput: true },
      { Name: 'Name', IsOutput: true },
      { Name: 'Type', IsOutput: true },
      { Name: 'description', IsOutput: true },
      { Name: 'sysid', IsOutput: true },
      { Name: 'createuser', IsOutput: true },
      { Name: 'createtime', IsOutput: true, OrderType: 'descending', Order: 1 },
    ])
    expect(result.total).toBe(12)
    expect(result.rows).toHaveLength(1)
  })

  it('omits blank filters and never derives sysid from the execution application', async () => {
    runtimeQuery.mockResolvedValue(context([{ rowid: 'ROW-1', sysid: 'business-app' }]))
    await new LowcodeDataSpaceCatalog('SCENE').query({ name: '   ', sysid: '   ' })
    const [, options] = firstRuntimeCall()
    expect(options).not.toHaveProperty('filter')
    expect(options).not.toHaveProperty('sysid')
  })

  it('loads all application options under the owner scenario and projects only readable keys and labels', async () => {
    runtimeQuery.mockResolvedValue(context([
      { rowid: 'APP-1', AppDesc: '部门平台', AppName: 'App One' },
      { rowid: 'APP-2', AppDesc: '   ', AppName: 'App Two' },
      { rowid: 'APP-3', AppDesc: 'MASKED-APP-LABEL', AppName: 'DO-NOT-FALLBACK', lingma_sys_params: { m: ['AppDesc'] } },
      { rowid: 'MASKED-APP-ID', AppDesc: 'Hidden key', lingma_sys_params: { m: ['rowid'] } },
      { rowid: 'INVISIBLE-APP-ID', AppDesc: 'Hidden key', lingma_sys_params: { h: ['rowid'] } },
    ], { total: 5, metaName: 'Base_AppSystemList' }))

    const options = await new LowcodeDataSpaceCatalog('SCENE').applications()

    expect(firstRuntimeCall()[0]).toEqual({ scenarioId: 'SCENE', metaName: 'Base_AppSystemList' })
    expect(firstRuntimeCall()[1]).toEqual({ fields: ['rowid', 'AppDesc', 'AppName'], allPages: true })
    expect(options).toEqual([
      { value: 'APP-1', label: '部门平台' },
      { value: 'APP-2', label: 'App Two' },
      { value: 'APP-3', label: '••••' },
    ])
    expect(JSON.stringify(options)).not.toContain('MASKED-APP-LABEL')
    expect(JSON.stringify(options)).not.toContain('DO-NOT-FALLBACK')
    expect(JSON.stringify(options)).not.toContain('MASKED-APP-ID')
    expect(JSON.stringify(options)).not.toContain('INVISIBLE-APP-ID')
  })

  it('validates every application row key and rejects non-scalar readable labels', async () => {
    runtimeQuery.mockResolvedValue(context([{ rowid: 'DUP', AppDesc: 'Visible' },
      { rowid: 'DUP', AppDesc: 'Hidden', lingma_sys_params: { h: ['rowid'] } }], { total: 2, metaName: 'Base_AppSystemList' }))
    await expect(new LowcodeDataSpaceCatalog('SCENE').applications()).rejects.toThrow(/唯一.*rowid/)

    runtimeQuery.mockResolvedValue(context([{ rowid: 'APP-1', AppDesc: { value: 'not scalar' } }], { metaName: 'Base_AppSystemList' }))
    await expect(new LowcodeDataSpaceCatalog('SCENE').applications()).rejects.toThrow(/标量值/)
  })

  it('binds an owner to its construction scope and rejects non-scalar visible values', async () => {
    const owner = new LowcodeDataSpaceCatalog('SCENE')
    readRequestScope.mockReturnValue({ token: 'scope-b', headers: { 'X-AppId': 'app-b' } })
    await expect(owner.query()).rejects.toThrow(/执行域/)
    expect(runtimeQuery).not.toHaveBeenCalled()

    readRequestScope.mockReturnValue({ token: 'scope-a', headers: { 'X-AppId': 'app-a' } })
    runtimeQuery.mockResolvedValue(context([{ rowid: 'ROW-1', Name: { nested: 'not scalar' } }]))
    await expect(new LowcodeDataSpaceCatalog('SCENE').query()).rejects.toThrow(/标量值/)
  })

  it('fails when the backend did not report a total or when rowid is absent or duplicated', async () => {
    const catalog = new LowcodeDataSpaceCatalog('SCENE')
    runtimeQuery.mockResolvedValue(context([{ rowid: 'ROW-1' }], { countReported: false }))
    await expect(catalog.query()).rejects.toThrow(/总数/)

    runtimeQuery.mockResolvedValue(context([{ Name: 'no key' }]))
    await expect(catalog.query()).rejects.toThrow(/rowid/i)

    runtimeQuery.mockResolvedValue(context([{ rowid: 'DUP' }, { rowid: 'DUP' }], { total: 2 }))
    await expect(catalog.query()).rejects.toThrow(/rowid/i)
  })

  it('projects each fixed field through the actual context and removes identity from presentation data', async () => {
    const queryContext = context([{ rowid: 'ROW-1', Name: 'VISIBLE', Type: 'datasource', description: 'MASK-ME',
      sysid: 'HIDE-ME', createuser: 'creator', createtime: '2026-01-01',
      lingma_sys_params: { m: ['description'], h: ['sysid'], d: true },
    }])
    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => Promise.resolve(
      identity.metaName === 'Base_UserInfo'
        ? context([{ ID: 'PERMISSION-CREATOR', rowid: 'creator', UserName: 'Creator Name' }], { metaName: 'Base_UserInfo' })
        : queryContext,
    ))
    const result = await new LowcodeDataSpaceCatalog('SCENE').query()
    expect(result.rows[0]).toEqual({
      rowid: 'ROW-1', Name: 'VISIBLE', Type: 'datasource', description: '••••',
      sysid: '', createuser: 'Creator Name', createtime: '2026-01-01',
    })
    expect(JSON.stringify(result.rows)).not.toContain('HIDE-ME')
    expect(JSON.stringify(result.rows)).not.toContain('MASK-ME')
  })

  it('looks up only distinct visible creator ids and projects names through both query contexts', async () => {
    const dataContext = context([
      { rowid: 'DATA-1', Name: 'one', createuser: ' USER-1 ' },
      { rowid: 'DATA-2', Name: 'two', createuser: 'USER-1' },
      { rowid: 'DATA-3', Name: 'masked', createuser: 'CREATEUSER-MASKED', lingma_sys_params: { m: ['createuser'] } },
      { rowid: 'DATA-4', Name: 'invisible', createuser: 'CREATEUSER-HIDDEN', lingma_sys_params: { h: ['createuser'] } },
      { rowid: 'DATA-5', Name: 'missing', createuser: 'NOT-FOUND' },
      { rowid: 'DATA-6', Name: 'hidden-user-key', createuser: 'KEY-HIDDEN' },
      { rowid: 'DATA-7', Name: 'empty-name', createuser: 'EMPTY-NAME' },
      { rowid: 'DATA-8', Name: 'masked-user-name', createuser: 'USER-MASKED' },
      { rowid: 'DATA-9', Name: 'hidden-user-name', createuser: 'USER-HIDDEN' },
      { rowid: 'DATA-10', Name: 'masked-user-key', createuser: 'KEY-MASKED' },
      { rowid: 'DATA-11', Name: 'hidden-output-key', createuser: 'ROWID-HIDDEN' },
      { rowid: 'DATA-12', Name: 'masked-output-key', createuser: 'ROWID-MASKED' },
    ], { total: 12 })
    const userContext = context([
      { ID: 'PERMISSION-1', rowid: 'USER-1', UserName: 'Ada' },
      { ID: 'PERMISSION-MASKED', rowid: 'USER-MASKED', UserName: 'MASKED-NAME', lingma_sys_params: { m: ['UserName'] } },
      { ID: 'PERMISSION-HIDDEN', rowid: 'USER-HIDDEN', UserName: 'HIDDEN-NAME', lingma_sys_params: { h: ['UserName'] } },
      { ID: 'PERMISSION-KEY-HIDDEN', rowid: 'KEY-HIDDEN', UserName: 'HIDDEN-USER-NAME', lingma_sys_params: { h: ['ROWID'] } },
      { ID: 'PERMISSION-KEY-MASKED', rowid: 'KEY-MASKED', UserName: 'MASKED-USER-NAME', lingma_sys_params: { m: ['ROWID'] } },
      { ID: 'PERMISSION-EMPTY', rowid: 'EMPTY-NAME', UserName: '   ' },
      { ID: 'PERMISSION-ROWID-HIDDEN', rowid: 'ROWID-HIDDEN', UserName: 'HIDDEN-OUTPUT-NAME', lingma_sys_params: { h: ['rowid'] } },
      { ID: 'PERMISSION-ROWID-MASKED', rowid: 'ROWID-MASKED', UserName: 'MASKED-OUTPUT-NAME', lingma_sys_params: { m: ['rowid'] } },
      { ID: 'PERMISSION-UNREQUESTED', rowid: 'UNREQUESTED', UserName: 'UNREQUESTED-NAME' },
    ], { total: 9, metaName: 'Base_UserInfo' })
    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => Promise.resolve(
      identity.metaName === 'Base_UserInfo' ? userContext : dataContext,
    ))

    const result = await new LowcodeDataSpaceCatalog('SCENE').query()

    expect(runtimeQuery).toHaveBeenCalledTimes(2)
    expect(runtimeQuery.mock.calls[1]?.[0]).toEqual({ scenarioId: 'SCENE', metaName: 'Base_UserInfo' })
    const lookupOptions = runtimeQuery.mock.calls[1]?.[1]
    expect(lookupOptions.fields).toEqual(['ID', 'ROWID', 'UserName'])
    expect(lookupOptions.allPages).toBe(true)
    expect(lookupOptions.filter.toJSON()).toEqual({ field: 'ROWID', operator: 'in', value: [
      'USER-1', 'NOT-FOUND', 'KEY-HIDDEN', 'EMPTY-NAME', 'USER-MASKED', 'USER-HIDDEN', 'KEY-MASKED', 'ROWID-HIDDEN', 'ROWID-MASKED',
    ] })
    expect(result.rows.map(row => row.createuser)).toEqual([
      'Ada', 'Ada', '••••', '', '未解析用户', '未解析用户', '未解析用户', '••••', '', '未解析用户', '未解析用户', '未解析用户',
    ])
    expect(result.unresolvedCreatorCount).toBe(6)
    expect(JSON.stringify(result)).not.toMatch(/PERMISSION-|CREATEUSER-MASKED|CREATEUSER-HIDDEN|MASKED-NAME|HIDDEN-NAME|HIDDEN-USER-NAME|MASKED-USER-NAME|HIDDEN-OUTPUT-NAME|MASKED-OUTPUT-NAME|UNREQUESTED-NAME/)
  })

  it.each([
    { rowField: 'rowid', deniedField: 'rowid', access: 'm' },
    { rowField: 'rowid', deniedField: 'rowid', access: 'h' },
    { rowField: 'rowid', deniedField: 'ROWID', access: 'm' },
    { rowField: 'rowid', deniedField: 'ROWID', access: 'h' },
    { rowField: 'ROWID', deniedField: 'ROWID', access: 'm' },
    { rowField: 'ROWID', deniedField: 'ROWID', access: 'h' },
    { rowField: 'ROWID', deniedField: 'rowid', access: 'm' },
    { rowField: 'ROWID', deniedField: 'rowid', access: 'h' },
  ] as const)('withholds creator names when only $rowField exists and $access denies $deniedField', async ({ rowField, deniedField, access }) => {
    const userRow: Record<string, unknown> = {
      ID: 'PRIVATE-PERMISSION-ID', UserName: 'PRIVATE-CREATOR-NAME',
      lingma_sys_params: { [access]: [deniedField] },
    }
    userRow[rowField] = 'BUSINESS-USER-ID'
    const dataContext = context([{ rowid: 'DATA-1', createuser: 'BUSINESS-USER-ID' }])
    const userContext = context([userRow], { metaName: 'Base_UserInfo' })
    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => Promise.resolve(
      identity.metaName === 'Base_UserInfo' ? userContext : dataContext,
    ))

    const result = await new LowcodeDataSpaceCatalog('SCENE').query()

    expect(result.rows[0]?.createuser).toBe('未解析用户')
    expect(result.unresolvedCreatorCount).toBe(1)
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE-PERMISSION-ID|PRIVATE-CREATOR-NAME/)
  })

  it('rejects malformed, duplicate, or wrong-primary-key user lookup rows and non-scalar names', async () => {
    const dataContext = context([{ rowid: 'DATA-1', createuser: 'USER-1' }])
    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => Promise.resolve(
      identity.metaName === 'Base_UserInfo'
        ? context([{ ID: 'PERMISSION-1', rowid: 'USER-1', UserName: 'Ada' },
          { ID: 'PERMISSION-1', rowid: 'USER-1', UserName: 'Other' }], {
          total: 2, metaName: 'Base_UserInfo',
        })
        : dataContext,
    ))
    await expect(new LowcodeDataSpaceCatalog('SCENE').query()).rejects.toThrow(/唯一.*ID/)

    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => Promise.resolve(
      identity.metaName === 'Base_UserInfo'
        ? context([{ ID: 'PERMISSION-1', ROWID: 'USER-1', UserName: 'Ada' }], {
          metaName: 'Base_UserInfo', primaryKey: 'rowid',
        })
        : dataContext,
    ))
    await expect(new LowcodeDataSpaceCatalog('SCENE').query()).rejects.toThrow(/唯一.*ID/)

    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => Promise.resolve(
      identity.metaName === 'Base_UserInfo'
        ? context([{ ID: 'PERMISSION-1', rowid: 'USER-1', UserName: { name: 'not scalar' } }], { metaName: 'Base_UserInfo' })
        : dataContext,
    ))
    await expect(new LowcodeDataSpaceCatalog('SCENE').query()).rejects.toThrow(/标量值/)
  })

  it('fails the catalog query when the creator lookup fails', async () => {
    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => identity.metaName === 'Base_UserInfo'
      ? Promise.reject(new Error('user directory unavailable')) : Promise.resolve(context([{ rowid: 'DATA-1', createuser: 'USER-1' }])))
    await expect(new LowcodeDataSpaceCatalog('SCENE').query()).rejects.toThrow('user directory unavailable')
  })

  it('does not choose between different permission rows with a duplicate business ROWID', async () => {
    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => Promise.resolve(
      identity.metaName === 'Base_UserInfo'
        ? context([
          { ID: 'PERMISSION-A', rowid: 'DUPLICATE-BUSINESS-ID', UserName: 'First Person' },
          { ID: 'PERMISSION-B', rowid: 'DUPLICATE-BUSINESS-ID', UserName: 'Second Person' },
        ], { total: 2, metaName: 'Base_UserInfo' })
        : context([{ rowid: 'DATA-1', createuser: 'DUPLICATE-BUSINESS-ID' }]),
    ))
    const result = await new LowcodeDataSpaceCatalog('SCENE').query()

    expect(result.rows[0]?.createuser).toBe('未解析用户')
    expect(result.unresolvedCreatorCount).toBe(1)
    expect(JSON.stringify(result)).not.toMatch(/PERMISSION-A|PERMISSION-B|First Person|Second Person/)
  })

  it('rejects conflicting formal and output spellings of the user business ROWID', async () => {
    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => Promise.resolve(
      identity.metaName === 'Base_UserInfo'
        ? context([{ ID: 'PERMISSION-1', ROWID: 'BUSINESS-ID', rowid: 'DIFFERENT-ID', UserName: 'Ada' }], { metaName: 'Base_UserInfo' })
        : context([{ rowid: 'DATA-1', createuser: 'BUSINESS-ID' }]),
    ))
    await expect(new LowcodeDataSpaceCatalog('SCENE').query()).rejects.toThrow(/ROWID 与 rowid.*冲突/)
  })

  it('skips creator lookup when source creator identities are empty or unreadable', async () => {
    runtimeQuery.mockResolvedValue(context([
      { rowid: 'DATA-1', createuser: 'MASKED-ID', lingma_sys_params: { m: ['createuser'] } },
      { rowid: 'DATA-2', createuser: 'INVISIBLE-ID', lingma_sys_params: { h: ['createuser'] } },
      { rowid: 'DATA-3', createuser: '   ' },
    ], { total: 3 }))
    const result = await new LowcodeDataSpaceCatalog('SCENE').query()

    expect(runtimeQuery).toHaveBeenCalledTimes(1)
    expect(result.rows.map(row => row.createuser)).toEqual(['••••', '', '-'])
    expect(result.unresolvedCreatorCount).toBe(0)
  })

  it('mounts the real page, uses route metadata rather than URL query, and renders projected permissions', async () => {
    mockByMetaName(context([{ rowid: 'ROW-1', Name: 'VISIBLE-NAME', Type: 'datasource',
      description: 'MASKED-SECRET', sysid: 'INVISIBLE-SECRET', createuser: 'USER-ID', createtime: 'DATE',
      lingma_sys_params: { m: ['description'], h: ['sysid'] },
    }], { total: 12 }))
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'META-SCENE' } },
    ] })
    await router.push('/directory?scenarioId=QUERY-SCENE')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()

    const listCall = runtimeQuery.mock.calls.find(call => call[0].metaName === 'Base_DataSet')
    expect(listCall?.[0]).toEqual({ scenarioId: 'META-SCENE', metaName: 'Base_DataSet' })
    expect(wrapper.find('#catalog-application option[value="APP-1"]').text()).toBe('App One')
    expect(wrapper.text()).toContain('VISIBLE-NAME')
    expect(wrapper.text()).toContain('••••')
    expect(wrapper.text()).not.toContain('MASKED-SECRET')
    expect(wrapper.text()).not.toContain('INVISIBLE-SECRET')
    expect(wrapper.html()).not.toContain('MASKED-SECRET')
    expect(wrapper.html()).not.toContain('INVISIBLE-SECRET')
    expect(wrapper.find('table tbody tr').exists()).toBe(true)
    expect(wrapper.find('table tbody').attributes()).not.toHaveProperty('rowid')
    expect(wrapper.find('table tbody tr').attributes()).not.toHaveProperty('data-rowid')

    await wrapper.get('#catalog-name').setValue(' FIND-ME ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(lastRuntimeCall()[1]).toMatchObject({ page: { index: 1, size: 10 },
      filter: expect.objectContaining({ toJSON: expect.any(Function) }) })
    const searchOptions = lastRuntimeCall()[1]
    expect(searchOptions.filter.toJSON()).toMatchObject({ logic: 'or', filters: [
      { field: 'Name', operator: 'contains', value: 'FIND-ME' },
      { field: 'rowid', operator: 'eq', value: 'FIND-ME' },
    ] })
    await wrapper.get('.catalog-pagination button:last-of-type').trigger('click')
    await flushPromises()
    expect(lastRuntimeCall()[1]).toMatchObject({ page: { index: 2, size: 10 } })
    wrapper.unmount()
  })

  it('renders resolved creator names and an ID-free unresolved-count notice from the actual page', async () => {
    const dataContext = context([
      { rowid: 'DATA-1', Name: 'RESOLVED-ROW', createuser: 'VISIBLE-USER' },
      { rowid: 'DATA-2', Name: 'UNRESOLVED-ROW', createuser: 'MISSING-USER' },
      { rowid: 'DATA-3', Name: 'MASKED-ROW', createuser: 'MASKED-CREATOR-ID', lingma_sys_params: { m: ['createuser'] } },
      { rowid: 'DATA-4', Name: 'HIDDEN-ROW', createuser: 'INVISIBLE-CREATOR-ID', lingma_sys_params: { h: ['createuser'] } },
    ], { total: 4 })
    const userContext = context([{ ID: 'PERMISSION-VISIBLE', rowid: 'VISIBLE-USER', UserName: 'Ada Lovelace' }], {
      total: 1, metaName: 'Base_UserInfo',
    })
    mockByMetaName(dataContext, context([{ rowid: 'APP-1', AppDesc: 'App One' }], { metaName: 'Base_AppSystemList' }), userContext)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'SCENE-A' } },
    ] })
    await router.push('/directory')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('table thead th:nth-child(6)').text()).toBe('创建人')
    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('未解析用户')
    expect(wrapper.text()).toContain('有 1 位创建人当前无法解析')
    expect(wrapper.text()).toContain('••••')
    expect(wrapper.html()).not.toMatch(/PERMISSION-VISIBLE|VISIBLE-USER|MISSING-USER|MASKED-CREATOR-ID|INVISIBLE-CREATOR-ID/)
    const lookup = runtimeQuery.mock.calls.find(call => call[0].metaName === 'Base_UserInfo')
    expect(lookup?.[1].filter.toJSON()).toEqual({ field: 'ROWID', operator: 'in', value: ['VISIBLE-USER', 'MISSING-USER'] })
    wrapper.unmount()
  })

  it.each(['success', 'failure'] as const)('keeps the newest page and creator notice when an older creator lookup finishes with %s', async outcome => {
    let finishOldLookup: ((value: DataSpaceQueryContext) => void) | undefined
    let failOldLookup: ((reason: Error) => void) | undefined
    const oldLookup = new Promise<DataSpaceQueryContext>((resolve, reject) => {
      finishOldLookup = resolve
      failOldLookup = reject
    })
    let listCalls = 0
    let userCalls = 0
    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => {
      if (identity.metaName === 'Base_AppSystemList') {
        return Promise.resolve(context([{ rowid: 'APP-1', AppDesc: 'App One' }], { metaName: 'Base_AppSystemList' }))
      }
      if (identity.metaName === 'Base_DataSet') {
        listCalls += 1
        const rows = listCalls === 1 ? [{ rowid: 'INITIAL', Name: 'INITIAL-ROW', createuser: 'MISSING-INITIAL' }]
          : listCalls === 2 ? [{ rowid: 'STALE', Name: 'STALE-ROW', createuser: 'USER-A' }]
            : [{ rowid: 'CURRENT', Name: 'CURRENT-ROW', createuser: 'USER-B' }]
        return Promise.resolve(context(rows))
      }
      userCalls += 1
      if (userCalls === 1) return Promise.resolve(context([], { total: 0, metaName: 'Base_UserInfo' }))
      if (userCalls === 2) return oldLookup
      return Promise.resolve(context([{ ID: 'PERMISSION-B', rowid: 'USER-B', UserName: 'CURRENT CREATOR' }], {
        metaName: 'Base_UserInfo',
      }))
    })
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'SAME-SCENE' } },
    ] })
    await router.push('/directory')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('有 1 位创建人当前无法解析')

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('正在加载数据空间')
    expect(wrapper.text()).not.toContain('有 1 位创建人当前无法解析')

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('CURRENT-ROW')
    expect(wrapper.text()).toContain('CURRENT CREATOR')
    expect(wrapper.text()).not.toContain('STALE-ROW')
    const currentDom = wrapper.html()
    if (outcome === 'success') {
      finishOldLookup?.(context([{ ID: 'PERMISSION-A', rowid: 'USER-A', UserName: 'STALE CREATOR' }], {
        metaName: 'Base_UserInfo',
      }))
    } else {
      failOldLookup?.(new Error('STALE CREATOR LOOKUP FAILURE'))
    }
    await flushPromises()

    expect(wrapper.html()).toBe(currentDom)
    expect(wrapper.text()).toContain('CURRENT-ROW')
    expect(wrapper.text()).toContain('CURRENT CREATOR')
    expect(wrapper.text()).not.toContain('STALE-ROW')
    expect(wrapper.text()).not.toContain('STALE CREATOR')
    expect(wrapper.text()).not.toContain('STALE CREATOR LOOKUP FAILURE')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('filters by selected application, retains it for paging, resolves the displayed label, and clears on reset', async () => {
    const appContext = context([
      { rowid: 'APP-1', AppDesc: '应用一', AppName: 'App One' },
      { rowid: 'APP-2', AppDesc: '', AppName: 'App Two' },
      { rowid: 'MASKED-APP-ID', AppDesc: 'Hidden key', lingma_sys_params: { m: ['rowid'] } },
      { rowid: 'INVISIBLE-APP-ID', AppDesc: 'Hidden key', lingma_sys_params: { h: ['rowid'] } },
      { rowid: 'APP-3', AppDesc: 'MASKED-APP-LABEL', AppName: 'NO-FALLBACK', lingma_sys_params: { m: ['AppDesc'] } },
    ], { total: 5, metaName: 'Base_AppSystemList' })
    mockByMetaName(context([{ rowid: 'DATA-1', Name: 'ITEM', Type: 'datasource', sysid: 'APP-2' }], { total: 25 }), appContext)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'META-SCENE' } },
    ] })
    await router.push('/directory')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('#catalog-application option[value="MASKED-APP-ID"]').exists()).toBe(false)
    expect(wrapper.find('#catalog-application option[value="INVISIBLE-APP-ID"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('MASKED-APP-ID')
    expect(wrapper.html()).not.toContain('INVISIBLE-APP-ID')
    expect(wrapper.find('#catalog-application option[value="APP-3"]').text()).toBe('••••')
    expect(wrapper.html()).not.toContain('MASKED-APP-LABEL')
    expect(wrapper.html()).not.toContain('NO-FALLBACK')

    await wrapper.get('#catalog-name').setValue(' ITEM ')
    await wrapper.get('#catalog-application').setValue('APP-2')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('table tbody tr td:nth-child(5)').text()).toBe('App Two')
    let listOptions = lastRuntimeCall()[1]
    expect(listOptions.page).toEqual({ index: 1, size: 10 })
    expect(listOptions.filter.toJSON()).toEqual({ logic: 'and', filters: [
      { logic: 'or', filters: [
        { field: 'Name', operator: 'contains', value: 'ITEM' },
        { field: 'rowid', operator: 'eq', value: 'ITEM' },
      ] },
      { field: 'sysid', operator: 'eq', value: 'APP-2' },
    ] })

    await wrapper.get('.catalog-pagination button:last-of-type').trigger('click')
    await flushPromises()
    listOptions = lastRuntimeCall()[1]
    expect(listOptions.page).toEqual({ index: 2, size: 10 })
    expect(listOptions.filter.toJSON()).toMatchObject({ logic: 'and', filters: [
      expect.objectContaining({ logic: 'or' }),
      { field: 'sysid', operator: 'eq', value: 'APP-2' },
    ] })

    await wrapper.get('button').trigger('click')
    await flushPromises()
    listOptions = lastRuntimeCall()[1]
    expect(listOptions.page).toEqual({ index: 1, size: 10 })
    expect(listOptions.filter.toJSON()).toEqual({ logic: 'or', filters: [
      { field: 'Name', operator: 'contains', value: 'ITEM' },
      { field: 'rowid', operator: 'eq', value: 'ITEM' },
    ] })
    await wrapper.get('form button:last-of-type').trigger('click')
    await flushPromises()
    expect(lastRuntimeCall()[1]).not.toHaveProperty('filter')
    wrapper.unmount()
  })

  it('shows application-option failures and retries them independently of the data list', async () => {
    let applicationCalls = 0
    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => {
      if (identity.metaName === 'Base_AppSystemList') {
        applicationCalls += 1
        return applicationCalls === 1
          ? Promise.reject(new Error('application options unavailable'))
          : Promise.resolve(context([{ rowid: 'APP-1', AppDesc: 'Retry Success' }], { metaName: 'Base_AppSystemList' }))
      }
      return Promise.resolve(context([{ rowid: 'DATA-1', Name: 'LIST-AVAILABLE', sysid: 'APP-1' }]))
    })
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'META-SCENE' } },
    ] })
    await router.push('/directory')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.get('.catalog-error').text()).toContain('application options unavailable')
    expect(wrapper.get('#catalog-application').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('LIST-AVAILABLE')

    await wrapper.get('.catalog-error button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.catalog-error').exists()).toBe(false)
    expect(wrapper.find('#catalog-application option[value="APP-1"]').text()).toBe('Retry Success')
    expect(applicationCalls).toBe(2)
    wrapper.unmount()
  })

  it('discards late application options when the formal scenario changes', async () => {
    let finishOldOptions: ((value: DataSpaceQueryContext) => void) | undefined
    const oldOptions = new Promise<DataSpaceQueryContext>(resolve => { finishOldOptions = resolve })
    let applicationCalls = 0
    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => {
      if (identity.metaName === 'Base_AppSystemList') {
        applicationCalls += 1
        return applicationCalls === 1 ? oldOptions
          : Promise.resolve(context([{ rowid: 'APP-NEW', AppDesc: 'NEW-SCENE-APP' }], { metaName: 'Base_AppSystemList' }))
      }
      return Promise.resolve(context([{ rowid: 'DATA-1', Name: 'DATA' }]))
    })
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/first', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'SCENE-A' } },
      { path: '/second', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'SCENE-B' } },
    ] })
    await router.push('/first')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()
    await router.push('/second')
    await flushPromises()
    expect(wrapper.find('#catalog-application option[value="APP-NEW"]').text()).toBe('NEW-SCENE-APP')

    finishOldOptions?.(context([{ rowid: 'APP-OLD', AppDesc: 'OLD-SCENE-APP' }], { metaName: 'Base_AppSystemList' }))
    await flushPromises()
    expect(wrapper.find('#catalog-application option[value="APP-NEW"]').exists()).toBe(true)
    expect(wrapper.find('#catalog-application option[value="APP-OLD"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('OLD-SCENE-APP')
    wrapper.unmount()
  })

  it.each(['success', 'failure'] as const)('does not publish pending application-option %s after only the execution scope changes', async outcome => {
    let finishPending: ((value: DataSpaceQueryContext) => void) | undefined
    let failPending: ((reason: Error) => void) | undefined
    const pendingOptions = new Promise<DataSpaceQueryContext>((resolve, reject) => {
      finishPending = resolve
      failPending = reject
    })
    runtimeQuery.mockImplementation((identity: DataSpaceQueryTable['identity']) => identity.metaName === 'Base_AppSystemList'
      ? pendingOptions : Promise.resolve(context([{ rowid: 'DATA-1', Name: 'LIST-READY', sysid: 'APP-1' }])))
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'SAME-SCENE' } },
    ] })
    await router.push('/directory?scenarioId=URL-ONLY')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(listRuntimeCalls()).toHaveLength(1)
    expect(wrapper.text()).toContain('LIST-READY')
    expect(wrapper.text()).toContain('正在加载应用选项')
    const pendingDom = wrapper.html()

    readRequestScope.mockReturnValue({ token: 'scope-b', headers: { 'X-AppId': 'app-b' } })
    if (outcome === 'success') {
      finishPending?.(context([{ rowid: 'APP-LATE', AppDesc: 'LATE-APP-OPTION' }], { metaName: 'Base_AppSystemList' }))
    } else {
      failPending?.(new Error('LATE-APP-OPTION-FAILURE'))
    }
    await flushPromises()

    expect(router.currentRoute.value.meta['blueprintScenarioId']).toBe('SAME-SCENE')
    expect(listRuntimeCalls()).toHaveLength(1)
    expect(wrapper.html()).toBe(pendingDom)
    expect(wrapper.text()).toContain('LIST-READY')
    expect(wrapper.text()).toContain('正在加载应用选项')
    expect(wrapper.text()).not.toContain('LATE-APP-OPTION')
    expect(wrapper.text()).not.toContain('LATE-APP-OPTION-FAILURE')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows initial configuration and execution-scope failures instead of an empty catalog', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/unconfigured', component: DataSpaceCatalogPage, meta: {} },
      { path: '/configured', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'META-SCENE' } },
    ] })
    await router.push('/unconfigured?scenarioId=QUERY-SCENE')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('缺少正式蓝图场景')
    expect(runtimeQuery).not.toHaveBeenCalled()

    readRequestScope.mockImplementation(() => { throw new Error('SPARK_EXECUTION_SCOPE_REQUIRED: 需要明确选中应用') })
    await router.push('/configured?scenarioId=QUERY-SCENE')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('SPARK_EXECUTION_SCOPE_REQUIRED')
    expect(runtimeQuery).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not let a late earlier query replace the newest page result', async () => {
    let finishOld: ((value: DataSpaceQueryContext) => void) | undefined
    const older = new Promise<DataSpaceQueryContext>(resolve => { finishOld = resolve })
    let listCallCount = 0
    mockListFlightsByMetaName(() => ++listCallCount === 1
      ? older : Promise.resolve(context([{ rowid: 'NEW', Name: 'LATEST' }])))
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'META-SCENE' } },
    ] })
    await router.push('/directory')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('LATEST')
    finishOld?.(context([{ rowid: 'OLD', Name: 'STALE' }]))
    await flushPromises()
    expect(wrapper.text()).toContain('LATEST')
    expect(wrapper.text()).not.toContain('STALE')
    wrapper.unmount()
  })

  it('does not let a late earlier failure replace the newest page state', async () => {
    let failOld: ((reason: Error) => void) | undefined
    const older = new Promise<DataSpaceQueryContext>((_resolve, reject) => { failOld = reject })
    let listCallCount = 0
    mockListFlightsByMetaName(() => ++listCallCount === 1
      ? older : Promise.resolve(context([{ rowid: 'NEW', Name: 'LATEST' }])))
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'META-SCENE' } },
    ] })
    await router.push('/directory')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('LATEST')
    failOld?.(new Error('STALE FAILURE'))
    await flushPromises()
    expect(wrapper.text()).toContain('LATEST')
    expect(wrapper.text()).not.toContain('STALE FAILURE')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each(['success', 'failure'] as const)('ignores a late %s after the route owner changes execution scope', async outcome => {
    let finishOld: ((value: DataSpaceQueryContext) => void) | undefined
    let failOld: ((reason: Error) => void) | undefined
    const older = new Promise<DataSpaceQueryContext>((resolve, reject) => {
      finishOld = resolve
      failOld = reject
    })
    let listCallCount = 0
    mockListFlightsByMetaName(() => ++listCallCount === 1
      ? older : Promise.resolve(context([{ rowid: 'CURRENT', Name: 'CURRENT-SCOPE' }])))
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'SCENE-A' } },
      { path: '/directory-next', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'SCENE-B' } },
    ] })
    await router.push('/directory')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()
    readRequestScope.mockReturnValue({ token: 'scope-b', headers: { 'X-AppId': 'app-b' } })
    await router.push('/directory-next')
    await flushPromises()
    expect(wrapper.text()).toContain('CURRENT-SCOPE')
    if (outcome === 'success') finishOld?.(context([{ rowid: 'OLD', Name: 'OLD-SCOPE' }]))
    else failOld?.(new Error('OLD-SCOPE-FAILURE'))
    await flushPromises()
    expect(wrapper.text()).toContain('CURRENT-SCOPE')
    expect(wrapper.text()).not.toContain('OLD-SCOPE')
    expect(wrapper.text()).not.toContain('OLD-SCOPE-FAILURE')
    wrapper.unmount()
  })

  it.each(['success', 'failure'] as const)('does not publish a pending %s when only the execution scope changes', async outcome => {
    let finishPending: ((value: DataSpaceQueryContext) => void) | undefined
    let failPending: ((reason: Error) => void) | undefined
    const pending = new Promise<DataSpaceQueryContext>((resolve, reject) => {
      finishPending = resolve
      failPending = reject
    })
    mockListFlightsByMetaName(() => pending)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'SAME-SCENE' } },
    ] })
    await router.push('/directory?scenarioId=URL-ONLY')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()
    expect(listRuntimeCalls()).toHaveLength(1)
    expect(wrapper.text()).toContain('正在加载')
    const pendingDom = wrapper.html()

    readRequestScope.mockReturnValue({ token: 'scope-b', headers: { 'X-AppId': 'app-b' } })
    if (outcome === 'success') finishPending?.(context([{ rowid: 'LATE-ROW', Name: 'LATE-SUCCESS' }]))
    else failPending?.(new Error('LATE-FAILURE'))
    await flushPromises()

    expect(router.currentRoute.value.meta['blueprintScenarioId']).toBe('SAME-SCENE')
    expect(listRuntimeCalls()).toHaveLength(1)
    expect(wrapper.html()).toBe(pendingDom)
    expect(wrapper.text()).toContain('正在加载')
    expect(wrapper.text()).not.toContain('LATE-ROW')
    expect(wrapper.text()).not.toContain('LATE-SUCCESS')
    expect(wrapper.text()).not.toContain('LATE-FAILURE')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each(['masked', 'invisible'] as const)('keeps a real table row while withholding a %s rowid from all DOM', async access => {
    const rowid = 'SENSITIVE-ROWID'
    mockByMetaName(context([{ rowid, Name: 'VISIBLE-NAME', Type: 'datasource',
      lingma_sys_params: access === 'masked' ? { m: ['rowid'] } : { h: ['rowid'] },
    }]))
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'META-SCENE' } },
    ] })
    await router.push('/directory')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.findAll('table tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('VISIBLE-NAME')
    if (access === 'masked') expect(wrapper.text()).toContain('••••')
    expect(wrapper.html()).not.toContain(rowid)
    wrapper.unmount()
  })

  it.each(['success', 'failure'] as const)('does not publish a pending %s after the real page unmounts', async outcome => {
    let finishPending: ((value: DataSpaceQueryContext) => void) | undefined
    let failPending: ((reason: Error) => void) | undefined
    const pending = new Promise<DataSpaceQueryContext>((resolve, reject) => {
      finishPending = resolve
      failPending = reject
    })
    mockListFlightsByMetaName(() => pending)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/directory', component: DataSpaceCatalogPage, meta: { blueprintScenarioId: 'META-SCENE' } },
    ] })
    await router.push('/directory')
    const wrapper = mount(DataSpaceCatalogPage, { global: { plugins: [router] } })
    await flushPromises()
    wrapper.unmount()
    if (outcome === 'success') finishPending?.(context([{ rowid: 'UNMOUNTED-ROW', Name: 'UNMOUNTED-SUCCESS' }]))
    else failPending?.(new Error('UNMOUNTED-FAILURE'))
    await flushPromises()
    expect(listRuntimeCalls()).toHaveLength(1)
  })
})
