import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlueprintWorkspace from '@/views/app/dev-system/blueprint-workspace/BlueprintWorkspace.vue'

const api = vi.hoisted(() => ({
  readRecords: vi.fn(), updateNodeFields: vi.fn(), listFileVersions: vi.fn(), upload: vi.fn(),
  readRequestScope: vi.fn(() => ({ token: 'scope-A', headers: { 'X-AppId': 'APP-A' } })),
}))
vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeHttp: {}, lowcodeApi: {
    readRequestScope: api.readRequestScope,
    blueprint: { readRecords: api.readRecords, updateNodeFields: api.updateNodeFields },
    design: { listFileVersions: api.listFileVersions },
  },
}))
vi.mock('@spark-appworks/spark-lowcode-api', async importOriginal => ({
  ...await importOriginal<typeof import('@spark-appworks/spark-lowcode-api')>(),
  LowcodeDesignFileUpload: class { uploadTextVersion = api.upload },
}))

const Slot = defineComponent({ template: '<div><slot /></div>' })
const Delivery = defineComponent({ emits: ['save'], template: '<button @click="$emit(\'save\')">交付</button>' })
function record(versionId = 'rule=1;script=1;style=1') {
  return { nodeId: 'node-A', capability: { description: 'planning' }, navigation: { target: 'cfg:APP-A/tool-A' },
    dataSpace: { scenarioId: 'scene-A' }, source: { VersionId: versionId } }
}
function setup() {
  const state = {
    selectedNode: ref({ nodeId: 'node-A' }), activePageId: ref('tool-A'), projectId: 'APP-A', addStatus: vi.fn(),
    project: { readPageFileText: vi.fn((name: string) => name === 'script.js' ? '' : `text:${name}`) },
  }
  const wrapper = mount({ ...BlueprintWorkspace, props: ['state'] }, {
    props: { state }, global: {
      directives: { loading: () => {} }, stubs: {
        ElTabs: Slot, ElTabPane: Slot, ElEmpty: true, PlanningPane: true, PrototypePane: true,
        DataPlanningPane: true, EstimatePane: true, DeliveryPane: Delivery, ReleasePane: true,
      },
    },
  })
  return { state, wrapper }
}

describe('BlueprintWorkspace file delivery', () => {
  beforeEach(() => {
    api.readRequestScope.mockReset().mockReturnValue({ token: 'scope-A', headers: { 'X-AppId': 'APP-A' } })
    api.readRecords.mockReset().mockResolvedValue([record()])
    api.updateNodeFields.mockReset().mockImplementation((_project, _node, patch) => Promise.resolve(record(patch.VersionId)))
    api.listFileVersions.mockReset().mockResolvedValue([{ version: 7, fileName: '7__rule.json', lastModified: null }])
    api.upload.mockReset().mockResolvedValue({ state: 'success' })
  })

  it('allocates from actual snapshots and confirms independent references, preserving empty text', async () => {
    const { wrapper } = setup(); await flushPromises()
    await wrapper.find('button').trigger('click'); await flushPromises()
    expect(api.upload.mock.calls.map(call => call[0])).toEqual([
      { customPath: 'APP-A/tool-A', fileName: '8__rule.json', text: 'text:rule.json' },
      { customPath: 'APP-A/tool-A', fileName: '8__script.js', text: '' },
      { customPath: 'APP-A/tool-A', fileName: '8__style.css', text: 'text:style.css' },
    ])
    expect(api.updateNodeFields.mock.calls.map(call => call[2].VersionId)).toEqual([
      'rule=8;script=1;style=1', 'rule=8;script=8;style=1', 'rule=8;script=8;style=8',
    ])
    wrapper.unmount()
  })

  it('reports the confirmed snapshot when its reference fails without claiming rollback', async () => {
    api.updateNodeFields.mockRejectedValueOnce(new Error('pointer rejected'))
    const { wrapper, state } = setup(); await flushPromises()
    await wrapper.find('button').trigger('click'); await flushPromises()
    expect(api.upload).toHaveBeenCalledTimes(1)
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已确认快照：8__rule.json；已确认发布引用：无'), 'error')
    wrapper.unmount()
  })

  it.each(['cfg:APP-B/tool-A', 'cfg:APP-A/../APP-B/tool-A'])('rejects a path outside the current application: %s', async target => {
    api.readRecords.mockResolvedValue([{ ...record(), navigation: { target } }])
    const { wrapper } = setup(); await flushPromises()
    await wrapper.find('button').trigger('click'); await flushPromises()
    expect(api.upload).not.toHaveBeenCalled()
    expect(api.listFileVersions).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('stops after a target switch without publishing the uploaded snapshot', async () => {
    let finish!: () => void
    api.upload.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve }))
    const { wrapper, state } = setup(); await flushPromises()
    await wrapper.find('button').trigger('click'); await flushPromises()
    state.selectedNode.value = { nodeId: 'node-B' }; await flushPromises()
    finish(); await flushPromises()
    expect(api.updateNodeFields).not.toHaveBeenCalled()
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已确认快照：8__rule.json'), 'error')
    wrapper.unmount()
  })

  it('preserves a confirmed snapshot but stops publishing edits made during upload', async () => {
    let finish!: () => void
    api.upload.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve }))
    const { wrapper, state } = setup(); await flushPromises()
    await wrapper.find('button').trigger('click'); await flushPromises()
    state.project.readPageFileText.mockReturnValue('edited')
    finish(); await flushPromises()
    expect(api.updateNodeFields).not.toHaveBeenCalled()
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已确认快照：8__rule.json'), 'error')
    wrapper.unmount()
  })

  it('does not publish an unconfirmed snapshot upload', async () => {
    api.upload.mockRejectedValueOnce(new Error('snapshot readback changed'))
    const { wrapper, state } = setup(); await flushPromises()
    await wrapper.find('button').trigger('click'); await flushPromises()
    expect(api.updateNodeFields).not.toHaveBeenCalled()
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('已尝试快照：8__rule.json'), 'error')
    wrapper.unmount()
  })

  it('stops when the published reference readback disagrees with the requested pointer', async () => {
    api.updateNodeFields.mockResolvedValueOnce(record('rule=99;script=1;style=1'))
    const { wrapper, state } = setup(); await flushPromises()
    await wrapper.find('button').trigger('click'); await flushPromises()
    expect(api.upload).toHaveBeenCalledTimes(1)
    expect(state.addStatus).toHaveBeenCalledWith(expect.stringContaining('发布指针回读不一致'), 'error')
    wrapper.unmount()
  })
})
