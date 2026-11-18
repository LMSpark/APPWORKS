/* global $page, $route */
// 页11业务配置：消费宿主原视图；不装配第二运行实例、不查询、不推导认证或保存。
const originalDraftKey = 'D3BBA1F0780056C837AC35E9825CAD5A@WorkingDraft@personalDraft'
let assertOriginalDraft
let selectedPath = null
let editorSession
let editorFault = false
let hostUnavailable = false
let saveReceipt
let saveReceiptError = false
let saveReceiptRequested = false

async function __init__() {
  editorSession = undefined
  editorFault = false
  hostUnavailable = false
  saveReceipt = undefined
  saveReceiptError = false
  const query = $route.query
  saveReceiptRequested = ['saveRequestKey', 'saveRequestDigest', 'saveContentDigest', 'saveExpectedDraftVersion']
    .some(key => Object.hasOwn(query, key))
  try {editorSession = await $page.invokeHostCommand('content.authoring.connect')}
  catch (cause) {
    hostUnavailable = cause?.message === 'PAGE_HOST_COMMAND_UNAVAILABLE'
    editorFault = !hostUnavailable
  }
  if (!saveReceiptRequested || !editorSession) return
  const {saveRequestKey, saveRequestDigest, saveContentDigest, saveExpectedDraftVersion} = query
  try {
    saveReceipt = await editorSession.readOriginalSave({requestKey: saveRequestKey, requestDigest: saveRequestDigest,
      contentDigest: saveContentDigest, expectedDraftVersion: saveExpectedDraftVersion})
  } catch {
    saveReceiptError = true
  }
}

function bindOriginalSave() {
  if (!saveReceiptRequested) return {visible: false}
  if (saveReceiptError || !saveReceipt) return {error: '原保存结果无法核验'}
  try {
    saveReceipt.assertCurrent()
    if (saveReceipt.state === 'SAVED') {
      const status = `原请求已保存草稿版 ${saveReceipt.draftVersion}，回执 ${saveReceipt.receiptRef}`
      try {
        saveReceipt.comparison?.assertCurrent()
        if (saveReceipt.comparison?.currentState === 'MATCHED') return {status: `${status}。当前草稿与原保存内容一致。`}
        if (saveReceipt.comparison?.currentState === 'NEWER_EDITS') return {status: `${status}。当前草稿与原保存内容不同。`}
      } catch {
        return {status}
      }
      return {status}
    }
    if (saveReceipt.state === 'NOT_SAVED') return {status: `原请求未保存，回执 ${saveReceipt.terminalRef}`}
    return {status: '原保存结果未知'}
  } catch {
    return {error: '原保存查询已失效'}
  }
}

function bindEditorStatus() {
  if (hostUnavailable) return {error: '正文编制未接入当前页面实例'}
  if (editorFault) return {error: '当前项目或工作草稿无法打开'}
  try {editorSession?.assertCurrent()}
  catch {return {error: '正文编制会话已失效，请重新打开草稿'}}
  return {}
}

function originalDraft() {
  if (editorFault) throw Error('CONTENT_PAGE_HOST_UNAVAILABLE')
  editorSession?.assertCurrent()
  const projectId = $route.query.projectId, draftId = $route.query.draftId
  if (typeof projectId !== 'string' || !projectId || projectId.trim() !== projectId
    || typeof draftId !== 'string' || !draftId || draftId.trim() !== draftId) throw Error('CONTENT_PAGE_TARGET_REQUIRED')
  const view = $page.resolveView(originalDraftKey)
  const row = view?.getEditingRow(draftId)
  if (!view || view.dataTable?.modelBinding?.modelName !== 'WorkingDraft' || !row
    || view.queryContext.projectId !== projectId || row.projectId !== projectId
    || typeof view.queryContext.currentUserId !== 'string' || !view.queryContext.currentUserId
    || row.userId !== view.queryContext.currentUserId) throw Error('CONTENT_PAGE_ORIGINAL_DRAFT_REQUIRED')
  if (!assertOriginalDraft) {
    const originalRow = view.rows.find(item => view.getPkKey(item) === draftId)
    if (!originalRow) throw Error('CONTENT_PAGE_ORIGINAL_DRAFT_REQUIRED')
    const assertResult = view.captureReadResult(), assertRow = view.captureReadRow(originalRow, ['id', 'projectId', 'userId', 'draft'])
    assertOriginalDraft = () => {
      if ($page.resolveView(originalDraftKey) !== view) throw Error('CONTENT_PAGE_RUNTIME_CHANGED')
      assertResult(); assertRow()
    }
  }
  assertOriginalDraft()
  return {view, projectId, draftId}
}

function bindOriginalDraft() {
  try {return {contextRowId: originalDraft().draftId}}
  catch {return {visible: false}}
}

function bindContentOutline() {
  try {return {outlineRootValue: originalDraft().projectId, ...(selectedPath === null ? {} : {selectedPath})}}
  catch {return {visible: false}}
}

function selectContentNode(path) {
  let current
  try {current = originalDraft()} catch {selectedPath = null; return}
  const {view, draftId} = current
  const draft = view.getEditingRow(draftId)?.draft
  if (path !== null && (!Array.isArray(path) || path.length !== 1 || !Number.isSafeInteger(path[0]) || path[0] < 0
    || !Array.isArray(draft?.nodes) || !draft.nodes[path[0]])) throw Error('CONTENT_PAGE_SELECTION_REQUIRED')
  try {editorSession?.select()}
  catch (cause) {
    if (cause?.message === 'CONTENT_COMMAND_PENDING_INPUT') return
    throw cause
  }
  selectedPath = path === null ? null : [path[0]]
}

function bindAction(label) {
  try {
    originalDraft()
    if (!editorSession) return {visible: false}
    const action = editorSession.actionProps(label, selectedPath)
    return {...action, onClick: () => {action.onClick(); selectedPath = null}}
  } catch {return {disabled: true}}
}
function bindAddDocument() {return bindAction('新增逻辑册')}
function bindAddChapter() {return bindAction('新增章节')}
function bindAddParagraph() {return bindAction('新增段落')}
function bindAddList() {return bindAction('新增项目符号列表')}
function bindAddOrderedList() {return bindAction('新增编号列表')}
function bindAddListItem() {return bindAction('新增列表项')}
function bindAddQuote() {return bindAction('新增引文')}
function bindAddTable() {return bindAction('新增普通表')}
function bindAddToc() {return bindAction('新增目录')}
function bindRemove() {return bindAction('删除所选子树')}
function bindMoveUp() {return bindAction('上移')}
function bindMoveDown() {return bindAction('下移')}
function bindCancel() {
  try {return {visible: !!editorSession, disabled: !editorSession || editorSession.canLeave}}
  catch {return {disabled: true}}
}
function cancelDraft() {editorSession?.cancel(); selectedPath = null}

function bindSelectedNode() {
  try {
    originalDraft()
    if (selectedPath === null) return {visible: false}
    if (editorSession) return editorSession.editorProps(selectedPath)
    return {valuePath: ['nodes', ...selectedPath]}
  } catch {return {visible: false}}
}
