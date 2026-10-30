import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolApprovalDisplayItem } from '@spark-appworks/spark-component'
import DevSystem from '@/views/app/dev-system/DevSystem.vue'

vi.mock('vue-router', () => ({ useRoute: () => ({query: {__sparkNavigationId: 'dev-system'}}) }))

let devSystemCtx: ReturnType<typeof createDevSystemCtx>

vi.mock('@/views/app/dev-system/useDevSystem', () => ({
  useDevSystem: () => devSystemCtx,
}))

function createDevSystemCtx(overrides: Record<string, unknown> = {}) {
  const state = {
    hasAnyDirty: ref(false),
    blueprintSaving: ref(false),
    pageIoBusy: ref(false),
    allSaving: ref(false),
    blueprintLoading: ref(false),
    blueprintPageRuntime: ref(undefined),
    blueprintEmpty: ref(true),
    treeData: ref([]),
    selectedNode: ref({nodeId:'dbms',parentNodeId:'root',projectId:'homepage',kind:'page',capability:{name:'数据库管理'},source:{}}),
    blueprintDraft: {nodeId:'dbms',parentNodeId:'root',projectId:'homepage',kind:'page',capability:{name:'数据库管理'},source:{}},
    activePageId: ref('dbms'),
    blueprintDirty: ref(false),
    hasAnyFileDirty: ref(false),
    pageDesignAiRunning: ref(false),
    aiToolApprovalPending: ref<readonly ToolApprovalDisplayItem[]>([]),
    pageDataError: ref(null),
    statusMessages: ref([]),
    pageList: ref([]),
    projectId: 'homepage',
    projectPicker: { projectId: 'homepage' },
    initialize: vi.fn().mockResolvedValue(undefined),
    loadBlueprintWorkspaceDataView: vi.fn().mockResolvedValue(undefined),
    openProjectPickerScope: vi.fn().mockResolvedValue(true),
    approveAiTool: vi.fn(),
    rejectAiTool: vi.fn(),
    abortAiTool: vi.fn(),
    projectPlanningDocumentImportDialogVisible: ref(false),
    projectPlanningDocumentUploading: ref(false),
    projectPlanningAiRunning: ref(false),
    projectPlanningDocumentFileName: ref(''),
    projectPlanningAttachmentRef: ref(''),
    projectPlanningAiTimeline: ref([]),
    openProjectPlanningDocumentImportDialog: vi.fn(),
    closeProjectPlanningDocumentImportDialog: vi.fn(),
    handleProjectPlanningDocumentFileSelected: vi.fn(),
    runProjectPlanningDocumentImportAi: vi.fn(),
  }

  return {
    state,
    workTab: ref('props'),
    previewRefreshToken: ref(0),
    currentWorkspaceFile: ref(null),
    pageDesignPromptViewKey: ref(''),
    pageDesignPromptScopeKey: ref('unbound'),
    initiatingProjectDataViewKey: ref('APP@Base_NavigationInfo@default'),
    blueprintTreeScopeKey: ref('runtime:APP@Base_NavigationInfo@default'),
    headerActionScopeKey: ref('runtime:APP@NODE-A@dbms@APP@Base_NavigationInfo@default'),
    headerActions: {
      saveAll: vi.fn(),
      preview: vi.fn(),
      runPageDesignAi: vi.fn(),
      previewPage: vi.fn(),
    },
    notifyPageDesignPromptChanged: vi.fn(),
    canPreviewCurrentPage: ref(true),
    canSaveFromHeader: ref(true),
    canRunPageDesignAi: ref(false),
    headerSaveLabel: ref('保存'),
    previewPage: vi.fn(),
    switchToPreview: vi.fn(),
    saveAll: vi.fn(),
    runPageDesignAi: vi.fn(),
    isWorkspaceTabDirty: vi.fn(() => false),
    ...overrides,
  }
}

const ButtonStub = defineComponent({
  props: {label:String},
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')">{{ label }}<slot /></button>',
})

const PassthroughStub = defineComponent({
  template: '<div><slot name="label" /><slot /></div>',
})

const SelectStub = defineComponent({
  props: {
    modelValue: String,
  },
  emits: ['update:modelValue', 'visible-change'],
  template: '<div><slot /></div>',
})

const ApprovalPanelStub = defineComponent({
  props: {
    pending: {
      type: Array,
      default: () => [],
    },
    emptyText: String,
  },
  emits: ['allow', 'reject', 'abort'],
  template: `
    <div data-testid="ai-tool-approval-panel">
      <button type="button" data-testid="approval-allow" @click="$emit('allow', pending[0].id)">allow</button>
      <button type="button" data-testid="approval-reject" @click="$emit('reject', pending[0].id, 'no')">reject</button>
      <button type="button" data-testid="approval-abort" @click="$emit('abort', pending[0].id, 'stop')">abort</button>
    </div>
  `,
})

function mountDevSystem() {
  return mount(DevSystem, {
    global: {
      directives: {
        loading: {
          mounted: vi.fn(),
          updated: vi.fn(),
        },
      },
      stubs: {
        AiToolApprovalPanel: ApprovalPanelStub,
        ProjectBlueprintTree: true,
        DevFileEditor: true,
        DevPreviewTab: true,
        BlueprintWorkspace: true,
        ProjectPlanningDocumentImportDialog: true,
        RendererButton: ButtonStub,
        RendererForm: true,
        FieldText: true,
        ElButton: ButtonStub,
        ElEmpty: true,
        ElInput: true,
        ElOption: true,
        ElSelect: SelectStub,
        ElTabPane: PassthroughStub,
        ElTabs: PassthroughStub,
        ElTag: true,
        NavIcon: true,
      },
    },
  })
}

describe('DevSystem header save action', () => {
  beforeEach(() => {
    devSystemCtx = createDevSystemCtx()
  })

  it('shows a save button for clean editable node props and triggers save', async () => {
    const wrapper = mountDevSystem()

    const saveButton = wrapper.findAll('button').find(button => button.text().includes('保存'))
    expect(saveButton).toBeDefined()

    await saveButton!.trigger('click')

    expect(devSystemCtx.headerActions.saveAll).toHaveBeenCalledOnce()
  })

  it('mounts the generic AI tool approval panel from app state', async () => {
    devSystemCtx.state.aiToolApprovalPending.value = [{
      id: 'approval-1',
      toolName: 'model_script',
      moduleId: 'pageDesign',
      argsPreview: '{}',
    }]

    const wrapper = mountDevSystem()

    expect(wrapper.find('[data-testid="ai-tool-approval-panel"]').exists()).toBe(true)

    await wrapper.find('[data-testid="approval-allow"]').trigger('click')
    await wrapper.find('[data-testid="approval-reject"]').trigger('click')
    await wrapper.find('[data-testid="approval-abort"]').trigger('click')

    expect(devSystemCtx.state.approveAiTool).toHaveBeenCalledWith('approval-1')
    expect(devSystemCtx.state.rejectAiTool).toHaveBeenCalledWith('approval-1', 'no')
    expect(devSystemCtx.state.abortAiTool).toHaveBeenCalledWith('approval-1', 'stop')
  })

  it('does not allow free-text project ids in the header picker', () => {
    const wrapper = mountDevSystem()
    expect(wrapper.find('.dev-project-picker__project').exists()).toBe(false)
    expect(wrapper.findComponent({name: 'NavHostProjectPicker'}).exists()).toBe(true)
  })
})
