import {beforeEach, describe, expect, it, vi} from 'vitest'
import {APPLICATION_CATALOG_PROJECT_ID, buildApplicationPath} from '@/services/application-scope'
import {EnterpriseDefaultApplication, enterEnterpriseLanding} from '@/services/project/enterprise-landing'
import type {ProjectSwitchService} from '@/services/project/project-shell'

type EnterpriseRow = Record<string, unknown>
type LandingState = {
  config: Record<string, unknown>
  rows: EnterpriseRow[]
  applications: Array<{id: string}>
  write: string
  refresh: {success: boolean; message?: string}
  saveError: Error | null
  unconfirmed: boolean
  destroyed: number
  messages: string[]
  pending: {key: string; value: unknown} | null
}

const state = vi.hoisted((): LandingState => ({
  config: {}, rows: [], applications: [], write: 'allowed', refresh: {success: true},
  saveError: null, unconfirmed: false, destroyed: 0, messages: [], pending: null,
}))

const view = vi.hoisted(() => ({
  tableName: 'Base_Enterprise_Info',
  viewId: 'tenantEnterprise',
  queryContext: {},
  get rows() { return state.rows },
  getPkKey: (row: EnterpriseRow) => row['rowid'],
  requestRefresh: vi.fn(async () => state.refresh),
  fieldAccess: () => ({read: 'visible', write: state.write}),
  readFieldMember: (_row: EnterpriseRow, member: {path: readonly string[]}) => state.config[member.path[0]!],
  hasEditingChanges: () => false,
  hasUnconfirmedSave: false,
  hasUnconfirmedSaveFor: () => state.unconfirmed,
  updateEditingMember: vi.fn((_id: string, edit: {path: readonly string[]; value: unknown}) => {
    state.pending = {key: edit.path[0]!, value: edit.value}
  }),
  discardPendingChanges: vi.fn(() => { state.pending = null }),
}))

const dataSet = vi.hoisted(() => ({
  saveChanges: vi.fn(async () => {
    if (state.saveError) throw state.saveError
    const pending = state.pending
    if (pending) {
      if (pending.value === undefined) delete state.config[pending.key]
      else state.config[pending.key] = pending.value
    }
  }),
  destroy: vi.fn(() => { state.destroyed++ }),
}))

const ui = vi.hoisted(() => ({
  showMessage: (message: string, type: 'info' | 'warning' = 'info') => state.messages.push(`${type}:${message}`),
}))
vi.mock('@spark-appworks/spark-app', () => ({getNavHomePath: () => '/home'}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {session: {get: () => ({enterprise: {shortName: 'acme'}})}},
}))
vi.mock('@/lowcode/lowcode-application-catalog', () => ({
  loadLowcodeEnterpriseCatalog: vi.fn(async () => dataSet),
  getFormalModelView: () => view,
  readLowcodeApplications: vi.fn(async () => state.applications),
}))

function routerProbe() {
  return {replace: vi.fn(async (_path: unknown): Promise<undefined> => undefined)}
}

function switchProbe() {
  return {switchAndReload: vi.fn<ProjectSwitchService['switchAndReload']>(async () => ({assertCurrent: () => undefined}))}
}

async function land(router = routerProbe(), projectSwitch = switchProbe()) {
  await enterEnterpriseLanding({router, projectSwitch, ui})
  return {router, projectSwitch}
}

const catalogPath = buildApplicationPath({projectId: APPLICATION_CATALOG_PROJECT_ID}, '/app-list')

beforeEach(() => {
  Object.assign(state, {config: {}, rows: [{rowid: 'ENT-1', entShortName: 'acme'}], applications: [{id: 'APP-A'}],
    write: 'allowed', refresh: {success: true}, saveError: null, unconfirmed: false, destroyed: 0, messages: [], pending: null})
  view.queryContext = {}
  vi.clearAllMocks()
})

describe('enterprise landing', () => {
  it('enters the enterprise default application home through the project switch', async () => {
    state.config['defaultApplicationId'] = 'APP-A'
    const {router, projectSwitch} = await land()

    expect(view.queryContext).toEqual({entShortName: 'acme'})
    expect(projectSwitch.switchAndReload).toHaveBeenCalledWith('APP-A')
    expect(router.replace).toHaveBeenCalledTimes(1)
    expect(router.replace).toHaveBeenCalledWith(buildApplicationPath({projectId: 'APP-A'}, '/home'))
    expect(state.messages).toEqual([])
    expect(state.destroyed).toBe(1)
  })

  it('falls back to the application list with an info message when no default is set', async () => {
    const {router, projectSwitch} = await land()

    expect(projectSwitch.switchAndReload).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith(catalogPath)
    expect(state.messages).toEqual(['info:企业未设置默认应用，已进入应用列表'])
  })

  it('falls back with a warning when the default application is not visible', async () => {
    state.config['defaultApplicationId'] = 'APP-HIDDEN'
    const {router, projectSwitch} = await land()

    expect(projectSwitch.switchAndReload).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith(catalogPath)
    expect(state.messages).toEqual(['warning:企业默认应用不在当前可见应用中，已进入应用列表'])
  })

  it('reports a read failure instead of silently landing on an empty default', async () => {
    state.rows = []
    const {router} = await land()

    expect(router.replace).toHaveBeenCalledWith(catalogPath)
    expect(state.messages).toEqual(['warning:企业默认应用读取失败：未读取到唯一的本企业配置记录，已进入应用列表'])
    expect(state.destroyed).toBe(1)
  })

  it('falls back when switching into the default application fails', async () => {
    state.config['defaultApplicationId'] = 'APP-A'
    const projectSwitch = switchProbe()
    projectSwitch.switchAndReload.mockRejectedValueOnce(new Error('dirty page'))
    const {router} = await land(routerProbe(), projectSwitch)

    expect(router.replace).toHaveBeenCalledWith(catalogPath)
    expect(state.messages).toEqual(['warning:企业默认应用进入失败：dirty page，已进入应用列表'])
  })
})

describe('EnterpriseDefaultApplication', () => {
  it('saves only the enterprise row config member and verifies the reread', async () => {
    const config = await EnterpriseDefaultApplication.load(() => undefined)
    await config.save('APP-A')

    expect(view.updateEditingMember).toHaveBeenCalledWith('ENT-1', {field: 'ent_config', path: ['defaultApplicationId'], value: 'APP-A'})
    expect(dataSet.saveChanges).toHaveBeenCalledWith({views: [{tableName: 'Base_Enterprise_Info', viewId: 'tenantEnterprise', ids: ['ENT-1']}]})
    expect(config.applicationId).toBe('APP-A')

    await config.save(null)
    expect(view.updateEditingMember).toHaveBeenLastCalledWith('ENT-1', {field: 'ent_config', path: ['defaultApplicationId'], value: undefined})
    expect(config.applicationId).toBe('')
    config.destroy()
  })

  it('discards the local edit after a definite failure but keeps it when the result is unknown', async () => {
    const config = await EnterpriseDefaultApplication.load(() => undefined)
    state.saveError = new Error('rejected')
    await expect(config.save('APP-A')).rejects.toThrow('rejected')
    expect(view.discardPendingChanges).toHaveBeenCalledWith(['ENT-1'])

    view.discardPendingChanges.mockClear()
    state.unconfirmed = true
    await expect(config.save('APP-A')).rejects.toThrow('rejected')
    expect(view.discardPendingChanges).not.toHaveBeenCalled()
    config.destroy()
  })

  it('refuses to save without config write access', async () => {
    state.write = 'denied'
    const config = await EnterpriseDefaultApplication.load(() => undefined)

    expect(config.writable).toBe(false)
    await expect(config.save('APP-A')).rejects.toThrow('无权修改企业配置')
    expect(view.updateEditingMember).not.toHaveBeenCalled()
    config.destroy()
  })
})
