/**
 * @module app:views/features/application/application-function-management/ui/page-design/useDevFileEditor
 * 职责：页面设计工具文件编辑器的状态组合。
 * 边界：工具文件状态与持久化沿正式 DataView/DataSet 链处理。
 * AI用途：需要理解页面设计如何编辑工具文件时，用本模块定位。
 */
import { computed, ref, type Ref, watch } from 'vue'
import type { DevState } from '../blueprint-state/useDevState'
import type { PageToolFileName } from '@spark-appworks/spark-project-model'

/** 页面文件内容与编辑状态经文件 DataView；持久化及回执由 DataSet 与数据层资源适配承接。 */
export function useDevFileEditor(state: DevState, activeFile: Readonly<Ref<PageToolFileName>>) {
  const project = state.project
  const retryableUnconfirmed = ref(false)
  function fileState(name:PageToolFileName){
    void state.externalDataViewRevision.value
    const pageId=state.activePageId.value
    if(!pageId)return undefined
    try{return state.pageToolFileDataViewState(pageId,name)}catch{return undefined}
  }

  function alignActivePage(): boolean {
    const pageId = state.activePageId.value.trim()
    if (!pageId) return false
    if (project.getActivePage()?.pageId !== pageId) {
      project.setActivePage(pageId)
    }
    return true
  }

  const isReady = computed(() => {
    const pageId=state.activePageId.value
    return pageId!==''&&project.getActivePage()?.pageId===pageId
  })
  const isDirty = computed(() => fileState(activeFile.value)?.dirty ?? false)
  const isUnconfirmed = computed(() => fileState(activeFile.value)?.unconfirmed ?? false)
  const text = computed(() => {
    void state.projectRevision.value
    void state.externalDataViewRevision.value
    const pageId=state.activePageId.value
    if(!pageId)return ''
    return state.readPageToolFileDataViewText(pageId,activeFile.value)
  })

  async function ensureLoaded(options?: { forceReload?: boolean }) {
    const pageId=state.activePageId.value
    if (!pageId) return
    if (!alignActivePage()) return
    await state.loadPageToolFileDataView({pageId,fileName:activeFile.value,forceReload:options?.forceReload===true})
  }

  function isFileDirty(name: PageToolFileName): boolean {
    void state.projectRevision.value
    return fileState(name)?.dirty ?? false
  }

  async function save() {
    if (state.pageIoBusy.value || state.allSaving.value) return
    const pageId = state.activePageId.value
    const fileName = activeFile.value
    if (!pageId || !alignActivePage()) return

    state.pageIoBusy.value = true
    try {
      const view=await state.loadPageToolFileDataView({pageId,fileName})
      if(view.hasUnconfirmedSave){
        const recovered=await view.verifySourceWriteAttempt()
        retryableUnconfirmed.value=recovered.retryable===true
        if(recovered.state==='unknown'){
          state.addStatus(retryableUnconfirmed.value
            ? `${fileName} 原提交仍无法确认，但远端仍是写前基线；可使用单独的同内容补偿重试`
            : `${fileName} 原提交仍无法确认：${recovered.message ?? '远端状态不是原正文'}`, 'warning')
          return
        }
      }
      await state.savePageToolFile({pageId,fileName})
      retryableUnconfirmed.value=false
      state.addStatus(`页面 ${pageId}/${fileName} 本轮提交已确认${isFileDirty(fileName) ? '，仍有新修改待保存' : ''}`, 'success')
    } catch (e) {
      state.addStatus(`保存 ${fileName} 失败: ${String(e)}${isUnconfirmed.value ? '；再次保存先核验原提交' : ''}`, 'error')
      throw e
    } finally {
      state.pageIoBusy.value = false
    }
  }

  async function retryUnconfirmed() {
    if(state.pageIoBusy.value||state.allSaving.value||!retryableUnconfirmed.value)return
    const pageId=state.activePageId.value,fileName=activeFile.value
    if(!pageId||!alignActivePage())return
    state.pageIoBusy.value=true
    try{
      const view=await state.loadPageToolFileDataView({pageId,fileName})
      const verified=await view.retrySourceWriteAttempt()
      if(verified.state!=='confirmed')throw new Error(verified.message??'同内容补偿重试未确认')
      await state.savePageToolFile({pageId,fileName})
      retryableUnconfirmed.value=false
      state.addStatus(`页面 ${pageId}/${fileName} 同内容补偿写入已精确回读`, 'success')
    }catch(error){
      state.addStatus(`补偿重试 ${fileName} 未确认: ${String(error)}`, 'error')
      throw error
    }finally{state.pageIoBusy.value=false}
  }

  async function refresh() {
    try {await ensureLoaded({ forceReload: true })}
    catch (cause) {state.addStatus(`文件重载未完成：${String(cause)}`, 'error'); throw cause}
  }

  watch([()=>state.activePageId.value,activeFile,isUnconfirmed],([pageId,fileName,unconfirmed],previous)=>{
    if(pageId===previous[0]&&fileName===previous[1]&&unconfirmed)return
    retryableUnconfirmed.value=false
  })

  return {
    isReady,
    isDirty,
    isUnconfirmed,
    retryableUnconfirmed,
    text,
    ensureLoaded,
    isFileDirty,
    save,
    retryUnconfirmed,
    refresh,
  }
}
