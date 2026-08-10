import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolApprovalDisplayItem } from '@spark-appworks/spark-component'
import DevSystem from '@/views/app/dev-system/DevSystem.vue'

let devSystemCtx: ReturnType<typeof createDevSystemCtx>

vi.mock('@/views/app/dev-system/useDevSystem', () => ({
  useDevSystem: () => devSystemCtx,
}))

function createDevSystemCtx(overrides: Record<string, unknown> = {}) {
  const state = {
    hasAnyDirty: ref(false),
    blueprintSaving: ref(false),
    pageIoBusy: ref(false),
    blueprintLoading: ref(false),
    blueprintEmpty: ref(true),
    treeData: ref([]),
    selectedNode: ref({ id: 'dbms', title: '数据库管理' }),
    blueprintDraft: { id: 'dbms', title: '数据库管理' },
    activePageId: ref('dbms'),
    blueprintDirty: ref(false),
    hasAnyFileDirty: ref(false),
    pageDesignAiRunning: ref(false),
    aiToolApprovalPending: ref<readonly ToolApprovalDisplayItem[]>([]),
    pageDataError: ref(null),
    statusMessages: ref([]),
    pageList: ref([]),
    tenantId: 'tenant-a',
    projectId: 'homepage',
    projectPicker: { tenantId: 'tenant-a', projectId: 'homepage' },
    editableProjects: ref([
      { tenantId: 'tenant-a', projectId: 'homepage', name: 'Homepage', icon: 'Box', description: '' },
    ]),
    projectOptionsLoading: ref(false),
    initialize: vi.fn().mockResolvedValue(undefined),
    loadEditableProjects: vi.fn().mockResolvedValue(undefined),
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
    pageDesignAiPrompt: ref(''),
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
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
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
        DevSiteTree: true,
        DevNodeProps: true,
        DevFileEditor: true,
        DevPreviewTab: true,
        ProjectPlanningDocumentImportDialog: true,
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

    expect(devSystemCtx.saveAll).toHaveBeenCalledOnce()
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
})
