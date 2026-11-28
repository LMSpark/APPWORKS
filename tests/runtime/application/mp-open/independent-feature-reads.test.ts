import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import { Spark, registerAllRenderers } from '@spark-appworks/spark-component'
import { bindDataSetReadonlyCommandQuery, DataSet, RequestState, type DataRow } from '@spark-appworks/spark-data'
import Channels from '@/views/features/integration/mp-open/ui/channels-page.vue'
import Relations from '@/views/features/integration/mp-open/ui/my-miniapp-relations.vue'

const scenarioLoader = vi.hoisted(() => vi.fn())
vi.mock('@/platform-adapters/data-space/lowcode-data-space-runtime', () => ({
  loadLowcodeRuntimeScenario: scenarioLoader,
}))

const cases = {
  channels: {
    scenarioId: '0BBCD14A992018D72F7D0131BBEE6700',
    page: 'channels-page',
    fastSection: '运营号',
    slowSection: '视频号账号',
    members: [['base_channel_operator_account', 'operators'], ['WechatChannelsAccounts', 'default']],
    rows: [],
  },
  relations: {
    scenarioId: '547CB8AD9613D81428C2280A8FC22819',
    page: 'my-miniapp-page',
    fastSection: '安装申请',
    slowSection: '渠道部署',
    members: [['base_channel_miniapp_template_application', 'applications'], ['base_channel_miniapp_deployment', 'deployments'],
      ['base_channel_account_application', 'bindings']],
    rows: [{ id: 'AP-1', channel_account_id: 'ACCOUNT' }],
  },
} as const

type Feature = keyof typeof cases

registerAllRenderers()

async function openFeature(feature: Feature) {
  const {scenarioId, page, members, rows} = cases[feature]
  const tables = Object.fromEntries(members.map(([tableName, viewId]) => [tableName, {
    tableName, resourceType: 'service-query',
    resourceId: tableName,
    columns: [
      {name: 'id', type: 'string', isPrimaryKey: true},
      {name: 'channel_account_id', type: 'string'},
      {name: 'usage_code', type: 'string'}, {name: 'status', type: 'string'},
    ],
    views: {default: {}, [viewId]: {}},
  }]))
  const dataSet = DataSet.fromJson({scenarioId, tables})
  let settle = (_result: DataRow[]) => {}
  let deny = (_error: Error) => {}
  const pending = new Promise<DataRow[]>((resolve, reject) => {
    settle = resolve
    deny = reject
  })
  const readSlow = vi.fn(() => pending)
  const readFast = vi.fn(async () => ({rows: rows.map(row => ({...row})), total: rows.length}))
  const views = members.map(([tableName, viewId], index) => {
    const view = dataSet.getView(tableName, viewId)
    if (!view) throw new Error('Missing fixture named view')
    bindDataSetReadonlyCommandQuery(view, {
      resource: {resourceType: 'service-query', resourceId: tableName},
      guard: () => {},
      ...(index === 0 ? {loadPage: readFast} : {loadRows: index === 1 ? readSlow : async () => []}),
    })
    return view
  })
  const [fast, slow] = views
  if (!fast || !slow) throw new Error('Missing paired fixture views')
  scenarioLoader.mockResolvedValueOnce(dataSet)
  const component = defineComponent({
    render: () => feature === 'channels' ? h(Channels) : h(Relations, {accountKey: 'ACCOUNT'}),
  })
  const path = `/apps/APP/features/integration/mp-open/ui/${page}`
  const router = createRouter({history: createMemoryHistory(), routes: [{path, component, meta: {
    nodeId: scenarioId, blueprintScenarioId: scenarioId, systemPageIdentityState: 'resolved',
  }}]})
  await router.push(path)
  const wrapper = mount(component, {global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  return {wrapper, fast, slow, readFast, readSlow, settle, deny}
}

describe('independent mp-open initial reads', () => {
  it.each(['channels','relations'] as const)('surfaces the completed view while a peer read is pending on %s', async feature => {
    const f = await openFeature(feature)
    const {fastSection, slowSection} = cases[feature]
    const section = (name: string) => f.wrapper.get(`[aria-label="${name}"]`)
    try {
      await vi.waitFor(() => expect(f.readSlow).toHaveBeenCalledOnce())
      await vi.waitFor(() => expect(f.fast.requestState).toBe(RequestState.Loaded))
      await flushPromises()
      expect(f.wrapper.find(`[aria-label="${fastSection}"]`).exists()).toBe(true)
      expect(f.slow.requestState).toBe(RequestState.Loading)
      if (feature === 'channels') {
        expect(section(fastSection).text()).toContain('没有符合条件的运营号')
        f.deny(new Error('专用账号无权读取'))
        await vi.waitFor(() => expect(section(slowSection).get('[role="alert"]').text()).toContain('专用账号无权读取'))
      } else {
        expect(f.fast.rows).toMatchObject([{id: 'AP-1', channel_account_id: 'ACCOUNT'}])
        f.settle([{id: 'DEP-1', channel_account_id: 'ACCOUNT'}])
        await vi.waitFor(() => expect(f.slow.requestState).toBe(RequestState.Loaded))
        expect(f.slow.rows).toMatchObject([{id: 'DEP-1'}])
      }
      expect(section(fastSection).isVisible()).toBe(true)
      expect(f.readFast).toHaveBeenCalledOnce()
      expect(f.readSlow).toHaveBeenCalledOnce()
    } finally {
      f.wrapper.unmount()
      f.settle([])
      await flushPromises()
    }
  })

  it('keeps a late account result in its retired instance after independent reopen', async () => {
    const old = await openFeature('channels')
    try {
      await vi.waitFor(() => expect(old.readSlow).toHaveBeenCalledOnce())
    } finally {
      old.wrapper.unmount()
    }
    const current = await openFeature('channels')
    try {
      await vi.waitFor(() => expect(current.readSlow).toHaveBeenCalledOnce())
      expect(old.slow.destroyed).toBe(true)
      old.settle([{id: 'RETIRED'}])
      await flushPromises()
      expect(current.slow.requestState).toBe(RequestState.Loading)
      expect(current.slow.rows).toEqual([])
      current.settle([{id: 'CURRENT'}])
      await vi.waitFor(() => expect(current.slow.rows).toMatchObject([{id: 'CURRENT'}]))
      expect(current.readSlow).toHaveBeenCalledOnce()
    } finally {
      current.wrapper.unmount()
      current.settle([])
      await flushPromises()
    }
  })
})
