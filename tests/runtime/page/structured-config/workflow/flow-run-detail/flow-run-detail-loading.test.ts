import {afterEach, expect, it, vi} from 'vitest'
import {flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import {Spark} from '@spark-appworks/spark-component'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSet} from '@spark-appworks/spark-data'
import {prepareFlowRunDetailPage, type FlowRunDetailPreparedPage} from '@/platform-adapters/resources/system/workflow/manage'
import {useFlowRunDetailPage} from '@/views/features/workflow/flow-runtime/detail/ui/use-flow-run-detail-page'

vi.mock('@/platform-adapters/resources/system/workflow/manage', async original => ({
  ...await original<typeof import('@/platform-adapters/resources/system/workflow/manage')>(), prepareFlowRunDetailPage: vi.fn(),
}))
afterEach(() => vi.restoreAllMocks())

it.each([
  {release: 'unavailable', mode: 'resolve'}, {release: 'unavailable', mode: 'reject'},
  {release: 'unmount', mode: 'resolve'}, {release: 'unmount', mode: 'reject'},
] as const)('withdraws a pending graph on $release before its old task can $mode', async ({release, mode}) => {
  let finish!: () => void
  const pending = new Promise<FlowRunDetailPreparedPage>((resolve, reject) => {
    finish = mode === 'reject' ? () => reject(Error('old graph failure')) : () => resolve({
      nodeViewKey: '', edgeViewKey: '', stepViewKey: '', waitingViewKey: '',
      graphLayout: {nodePositions: {}, edgePaths: {}}, nodeBadges: {}, nodeBadgeField: 'runGraphBadge',
    })
  })
  vi.mocked(prepareFlowRunDetailPage).mockReturnValueOnce(pending)
  const available = ref(true), runtime = new PageRuntime({pageId: 'pending-detail', scenarioIds: [],
    loadScenario: async () => DataSet.fromJson({scenarioId: 'unused', tables: {}})})
  let state!: ReturnType<typeof useFlowRunDetailPage>
  const Probe = defineComponent({setup() {
    state = useFlowRunDetailPage(() => ({wfid: 'WF', flowid: 'FM'}), () => available.value ? runtime : undefined)
    return () => h('div')
  }})
  const wrapper = mount(Probe, {global: {plugins: [Spark.createPlugin()]}})
  try {
    expect(state.graphLoading.value).toBe(true)
    state.nodeDialogOpen.value = true
    if (release === 'unmount') wrapper.unmount()
    else available.value = false
    await flushPromises()
    expect(state.graphLoading.value).toBe(false)
    expect(state.nodeDialogOpen.value).toBe(false)
    finish(); await flushPromises()
    expect(state.graphLoading.value).toBe(false)
    expect(state.graphReady.value).toBe(false)
    expect(state.prepared.value).toBeUndefined()
    expect(state.graphError.value).toBe('')
  } finally {wrapper.unmount(); runtime.dispose()}
})
