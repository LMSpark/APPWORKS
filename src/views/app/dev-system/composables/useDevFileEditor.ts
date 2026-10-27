/**
 * @module app:views/app/dev-system/composables/useDevFileEditor
 * 职责：提供 DevSystem 的 useDevFileEditor 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
 * 边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
 * AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/composables/useDevFileEditor。
 */
import { computed, watch, type Ref } from 'vue'
import type { DevState } from '../useDevState'
import type { PageToolFileName } from '@spark-appworks/spark-project-model'

/** 页面内容页签绑定 — 内存读写经 ProjectBlueprint，加载/保存经 ProjectWorkspace。 */
export function useDevFileEditor(state: DevState, activeFile: Readonly<Ref<PageToolFileName>>) {
  const editor = state.editor
  const project = state.project

  function alignActivePage(): boolean {
    const pageId = state.activePageId.value.trim()
    if (!pageId) return false
    if (project.getActivePage()?.pageId !== pageId) {
      project.setActivePage(pageId)
    }
    return true
  }

  const isReady = computed(() => {
    void state.projectRevision.value
    return project.isActivePageLoaded()
  })
  const isDirty = computed(() => isFileDirty(activeFile.value))
  const isUnconfirmed = computed(() => {
    void state.projectRevision.value
    return editor.unconfirmedPageFiles.some(item => item.pageId === state.activePageId.value && item.fileName === activeFile.value)
  })
  const canUndo = computed(() => {
    void state.projectRevision.value
    return project.canUndoPageFile(activeFile.value)
  })
  const canRedo = computed(() => {
    void state.projectRevision.value
    return project.canRedoPageFile(activeFile.value)
  })
  const text = computed(() => {
    void state.projectRevision.value
    return project.readPageFileText(activeFile.value)
  })

  async function ensureLoaded(options?: { forceReload?: boolean }) {
    if (!state.activePageId.value) return
    if (options?.forceReload !== true && project.isActivePageLoaded()) return
    if (!alignActivePage()) return
    const loadOptions: { forceReload?: boolean } = {}
    if (options?.forceReload === true) loadOptions.forceReload = true
    await editor.ensureActivePageFilesLoaded(loadOptions)
  }

  function isFileDirty(name: PageToolFileName): boolean {
    void state.projectRevision.value
    return project.readDirtyProjection().dirtyFiles.has(name)
  }

  async function save() {
    if (state.pageIoBusy.value || state.allSaving.value) return
    const pageId = state.activePageId.value
    const fileName = activeFile.value
    if (!pageId || !alignActivePage()) return

    state.pageIoBusy.value = true
    try {
      await state.savePageToolFile({pageId,fileName})
      state.addStatus(`页面 ${pageId}/${fileName} 本轮提交已确认${isFileDirty(fileName) ? '，仍有新修改待保存' : ''}`, 'success')
    } catch (e) {
      state.addStatus(`保存 ${fileName} 失败: ${String(e)}${isUnconfirmed.value ? '；再次保存先核验原提交' : ''}`, 'error')
      throw e
    } finally {
      state.pageIoBusy.value = false
    }
  }

  async function refresh() {
    try {await ensureLoaded({ forceReload: true })}
    catch (cause) {state.addStatus(`文件重载未完成：${String(cause)}`, 'error'); throw cause}
  }

  watch(
    () => state.activePageId.value,
    (pageId) => {
      if (!pageId) return
      void ensureLoaded().catch(cause => state.addStatus(`工具文件加载失败：${String(cause)}`, 'error'))
    },
    { immediate: true },
  )

  return {
    isReady,
    isDirty,
    isUnconfirmed,
    canUndo,
    canRedo,
    text,
    ensureLoaded,
    isFileDirty,
    save,
    refresh,
  }
}
