/* global $page, $route */
// 页11业务配置：消费宿主原视图；不装配第二运行实例、不查询、不推导认证或保存。
const originalDraftKey = 'D3BBA1F0780056C837AC35E9825CAD5A@WorkingDraft@personalDraft'
let assertOriginalDraft
let selectedNodeId = null
let editorSession
let editorFault = false
let hostUnavailable = false
let saveReceipt
let saveReceiptError = false
let saveReceiptRequested = false
let saveReceiptQueryValid = false
let saveReceiptLoading = false
let saveReceiptSelection
let initialization = 0
let candidatePreviewPending = false
let draftCandidatePending = false

function draftCandidateRouteKey() {
  const {projectId, draftId, draftCandidateRequestKey, candidateTargetKind, candidateTargetNodeId, candidateNodeExtent,
    candidateAssignmentId, candidateBasisResponseId, candidateFirstBatchId, candidateBatchScopeIndex, candidateAddedNodeId} = $route.query
  return JSON.stringify({projectId, draftId, draftCandidateRequestKey, candidateTargetKind, candidateTargetNodeId, candidateNodeExtent,
    candidateAssignmentId, candidateBasisResponseId, candidateFirstBatchId, candidateBatchScopeIndex, candidateAddedNodeId})
}

function bindDraftCandidate() {
  const {draftCandidateRequestKey} = $route.query
  return {visible: typeof draftCandidateRequestKey === 'string' && !!draftCandidateRequestKey &&
    draftCandidateRequestKey.trim() === draftCandidateRequestKey, disabled: !editorSession || editorFault || draftCandidatePending}
}

async function openDraftCandidate() {
  const {visible, disabled} = bindDraftCandidate()
  if (!visible || disabled) return
  const {projectId, draftCandidateRequestKey, candidateTargetKind, candidateTargetNodeId, candidateNodeExtent,
    candidateAssignmentId, candidateBasisResponseId, candidateFirstBatchId, candidateBatchScopeIndex, candidateAddedNodeId} = $route.query
  const id = value => typeof value === 'string' && !!value && value.trim() === value
  const session = editorSession
  const routeKey = draftCandidateRouteKey()
  const isCurrent = () => editorSession === session && draftCandidateRouteKey() === routeKey
  draftCandidatePending = true
  try {
    if (!id(projectId) || (candidateFirstBatchId !== undefined && !id(candidateFirstBatchId))) throw Error('CONTENT_DRAFT_CANDIDATE_SCOPE')
    let target, targetScopeIndex
    if (candidateBatchScopeIndex !== undefined) {
      if (!id(candidateFirstBatchId) || candidateTargetKind !== undefined || typeof candidateBatchScopeIndex !== 'string' ||
        !/^(0|[1-9]\d*)$/u.test(candidateBatchScopeIndex)) throw Error('CONTENT_DRAFT_CANDIDATE_SCOPE')
      targetScopeIndex = Number(candidateBatchScopeIndex)
      if (!Number.isSafeInteger(targetScopeIndex)) throw Error('CONTENT_DRAFT_CANDIDATE_SCOPE')
    } else if (candidateTargetKind === 'PROJECT') target = {kind: 'PROJECT'}
    else if (candidateTargetKind === 'NODE' && id(candidateTargetNodeId) &&
      (candidateNodeExtent === 'NODE' || candidateNodeExtent === 'SUBTREE')) {
      target = {kind: 'NODE', nodeId: candidateTargetNodeId, extent: candidateNodeExtent}
    } else if (candidateTargetKind === 'RESPONSE' && id(candidateAssignmentId) &&
      (candidateBasisResponseId === null || id(candidateBasisResponseId))) {
      target = {kind: 'RESPONSE', assignmentId: candidateAssignmentId, responseId: candidateBasisResponseId}
    } else throw Error('CONTENT_DRAFT_CANDIDATE_SCOPE')
    const declaredAddedNodeIds = Array.isArray(candidateAddedNodeId) ? [...candidateAddedNodeId] : [candidateAddedNodeId]
    if (candidateAddedNodeId !== undefined && !declaredAddedNodeIds.every(id)) throw Error('CONTENT_DRAFT_CANDIDATE_SCOPE')
    const result = await session.prepareDraftCandidate({requestKey: draftCandidateRequestKey,
      ...(target ? {targetScope: {schemaVersion: 2, projectId, targets: [target]}} : {targetScopeIndex}),
      ...(candidateFirstBatchId ? {firstBatchId: candidateFirstBatchId} : {}),
      ...(candidateAddedNodeId === undefined ? {} : {declaredAddedNodeIds})})
    if (!isCurrent()) return
    result.assertCurrent()
    const lines = [
      `草稿 ${result.draftId} · 版本 ${result.draftVersion}`,
      `正文基版 ${result.baseRevisionId ?? '首稿'} · 冻结基线 ${result.baselineId}`,
      `请求摘要 ${result.requestDigest}`,
    ]
    if (result.requiresResponseUseCheck) {
      lines.push(`独立答复待核复核决定与当前准用：${result.responseVersions.map(item => item.responseId).join('、')}`)
    }
    if (result.requiresFactUseCheck && result.factVersions.length) {
      lines.push(`冻结事实待核当前准用：${result.factVersions.map(item => `${item.factId}（版本 ${item.version}）`).join('、')}`)
    }
    lines.push('候选登记待办理')
    await $page.showAlert(lines.join('\n'), '候选生成输入')
  } catch (cause) {
    if (!isCurrent()) return
    const messages = {
      CONTENT_DRAFT_CANDIDATE_UNRESOLVED_LINK: '候选中存在找不到目标的正文引用，请核对引用或恢复目标节点',
      CONTENT_DRAFT_CANDIDATE_NODE_TYPE_CHANGED: '候选改变了既有节点的类型，请核对节点身份',
      CONTENT_DRAFT_CANDIDATE_TARGET_MISMATCH: '候选含范围外改动或未声明的新增节点',
      CONTENT_DRAFT_CANDIDATE_FACT_NOT_FROZEN: '草稿引用的事实尚未列入冻结基线，请先核定并冻结事实版本',
      CONTENT_DRAFT_RESPONSE_VERSION: '无法核对所选独立答复的原版本，请确认答复与冻结基线中的分工版本一致',
      CONTENT_DRAFT_FIRST_HEAD_CHANGED: '项目已有采用的正文，请基于当前正文版本重新发起候选',
      CONTENT_CANDIDATE_DRAFT_UNSAVED: '当前草稿还有未保存的改动，请处理改动后再核对候选输入',
      CONTENT_COMMAND_MUTATING: '草稿保存状态仍待确认，请先核对原保存结果',
    }
    const code = cause?.message
    $page.showMessage(typeof code === 'string' && Object.hasOwn(messages, code) ? messages[code] :
      '无法核验候选生成输入，请确认草稿已保存且编制范围与原依据一致', 'warning')
  } finally {
    draftCandidatePending = false
  }
}

function bindCandidatePreview() {
  const {candidateRevisionId} = $route.query
  return {visible: typeof candidateRevisionId === 'string' && !!candidateRevisionId && candidateRevisionId.trim() === candidateRevisionId,
    disabled: !editorSession || editorFault || candidatePreviewPending}
}

function candidatePreviewRouteKey() {
  const {projectId, draftId, candidateRevisionId, candidateExpectedHead, candidateAddedNodeId, candidateFormDocumentId,
    formTemplateRef, formTemplateVersion} = $route.query
  return JSON.stringify({projectId, draftId, candidateRevisionId, candidateExpectedHead, candidateAddedNodeId,
    candidateFormDocumentId, formTemplateRef, formTemplateVersion})
}

async function openCandidatePreview() {
  const {visible, disabled} = bindCandidatePreview()
  if (!visible || disabled) return
  const {candidateRevisionId, candidateExpectedHead, candidateAddedNodeId, candidateFormDocumentId,
    formTemplateRef, formTemplateVersion} = $route.query
  const routeKey = candidatePreviewRouteKey()
  const session = editorSession
  const isCurrent = () => editorSession === session && candidatePreviewRouteKey() === routeKey
  candidatePreviewPending = true
  try {
    const id = value => typeof value === 'string' && !!value && value.trim() === value
    const declaredAddedNodeIds = candidateAddedNodeId === undefined ? [] :
      Array.isArray(candidateAddedNodeId) ? [...candidateAddedNodeId] : [candidateAddedNodeId]
    if (!declaredAddedNodeIds.every(id) || (candidateExpectedHead !== undefined && !id(candidateExpectedHead))) {
      throw Error('CONTENT_CANDIDATE_PAGE_SELECTION')
    }
    const options = {declaredAddedNodeIds}
    if (candidateFormDocumentId !== undefined) {
      if (![candidateFormDocumentId, formTemplateRef, formTemplateVersion].every(id)) throw Error('CONTENT_CANDIDATE_PAGE_SELECTION')
      options.originalFormTemplate = {documentId: candidateFormDocumentId, templateRef: formTemplateRef, templateVersion: formTemplateVersion}
    }
    const selection = {candidateRevisionId, expectedHead: candidateExpectedHead ?? null}
    const assertSelection = () => {
      if (!isCurrent()) throw Error('CONTENT_PAGE_RENDER_STALE')
    }
    let result = await session.previewCandidate(selection, options)
    result.assertCurrent()
    assertSelection()
    const missing = result.violations.filter(issue => issue.code === 'UNDECLARED_ADDITION').map(issue => issue.ownerId)
    if (missing.length) {
      const confirmed = await $page.showConfirm(`以下新增节点尚未声明：${missing.join('、')}`,
        '确认新增节点', {confirmText: '确认并重新预演', cancelText: '保留原预演'})
      result.assertCurrent()
      assertSelection()
      if (confirmed) {
        const additions = [...new Set([...declaredAddedNodeIds, ...missing])]
        result = await session.previewCandidate(selection, {...options, declaredAddedNodeIds: additions})
        result.assertCurrent()
        assertSelection()
      }
    }
    const lines = [
      `候选 ${candidateRevisionId} · ${result.scopeCheckPassed ? '变更范围已核' : '变更范围待处理'}`,
      `变更节点 ${result.changedNodeIds.join('、') || '无'}`,
      `新增节点 ${result.addedNodeIds.join('、') || '无'}`,
      `答复变更 ${result.responseChanges.length} 项`,
    ]
    for (const node of result.comparison.nodes) {
      if (node.nodeId !== null && node.conflicts.length) lines.push(`节点冲突 ${node.nodeId}`)
      if (node.nodeId !== null && node.deletionReferenceCheck === 'REFERENCED') {
        lines.push(`删除仍有引用的节点 ${node.nodeId} · 引用方 ${node.referencedBy.join('、')}`)
      }
    }
    for (const sibling of result.comparison.siblings) {
      if (sibling.status === 'CONFLICT') lines.push(`同级顺序冲突 · 父节点 ${sibling.parentId}`)
    }
    for (const response of result.responseComparison) {
      if (response.delta === 'DIVERGED') lines.push(`答复冲突 · 任务 ${response.assignmentId}`)
    }
    if (result.originalFormBasisCheck) lines.push('已核同册原表映射')
    const violations = {
      NODE_OUTSIDE_SCOPE: '节点越出授权范围', STRUCTURE_PARENT_OUTSIDE_SCOPE: '父节点越出授权范围',
      ADDITION_OUTSIDE_SCOPE: '新增节点越出授权范围', UNDECLARED_ADDITION: '新增节点未声明',
      UNEXPECTED_ADDITION_DECLARATION: '声明的新增节点未出现', RESPONSE_OUTSIDE_SCOPE: '答复越出授权范围',
      RESPONSE_BASIS_MISMATCH: '答复依据不符', RESPONSE_ID_REUSE: '答复标识重复使用',
    }
    for (const issue of result.violations) lines.push(`${issue.ownerId} · ${violations[issue.code]}`)
    lines.push('采用依据仍需在正式办理时核验')
    await $page.showAlert(lines.join('\n'), '候选变更预演')
  } catch {
    if (isCurrent()) $page.showMessage('候选变更无法预演', 'warning')
  } finally {
    candidatePreviewPending = false
  }
}

function bindOriginalForm() {
  const {formTemplateRef, formTemplateVersion} = $route.query
  return {visible: [formTemplateRef, formTemplateVersion].every(value => typeof value === 'string' && !!value && value.trim() === value),
    disabled: !editorSession || editorFault}
}

function bindOriginalFormComparison() {
  const {previousFormTemplateVersion, formTemplateVersion} = $route.query
  const {visible, disabled} = bindOriginalForm()
  return {visible: visible && typeof previousFormTemplateVersion === 'string' && !!previousFormTemplateVersion &&
    previousFormTemplateVersion.trim() === previousFormTemplateVersion && previousFormTemplateVersion !== formTemplateVersion, disabled}
}

function captureOriginalFormSelection(session) {
  const keys = ['projectId', 'draftId', 'formTemplateRef', 'formTemplateVersion', 'previousFormTemplateVersion']
  const values = keys.map(key => $route.query[key])
  return () => editorSession === session && keys.every((key, index) => $route.query[key] === values[index])
}

async function openOriginalFormComparison() {
  const {visible, disabled} = bindOriginalFormComparison()
  if (!visible || disabled) return
  const {formTemplateRef, previousFormTemplateVersion, formTemplateVersion} = $route.query
  const session = editorSession
  const isCurrent = captureOriginalFormSelection(session)
  try {
    const result = await session.compareOriginalForms({templateRef: formTemplateRef,
      previousVersion: previousFormTemplateVersion, currentVersion: formTemplateVersion})
    if (!isCurrent()) return
    result.assertCurrent()
    const lines = result.state === 'COMPARED' ? [
      `原表旧版 ${result.previousFormVersion} · 新版 ${result.currentFormVersion}`,
      ...result.changedFields.map(field => `需重新匹配 ${field}`),
      ...result.addedFields.map(field => `新增栏位 ${field}`),
      ...(!result.changedFields.length && !result.addedFields.length ? ['两版已登记的栏位映射一致'] : []),
    ] : ['两版原表映射待核']
    await $page.showAlert(lines.join('\n'), '换表差异')
  } catch {
    if (isCurrent()) $page.showMessage('换表差异无法核验', 'warning')
  }
}

async function openOriginalForm() {
  const {visible, disabled} = bindOriginalForm()
  if (!visible || disabled) return
  const {formTemplateRef, formTemplateVersion} = $route.query
  const session = editorSession
  const isCurrent = captureOriginalFormSelection(session)
  try {
    const result = await session.readOriginalForm({templateRef: formTemplateRef, templateVersion: formTemplateVersion})
    if (!isCurrent()) return
    result.assertCurrent()
    const lines = ['模板原表映射待登记']
    if (result.state === 'MATCHED') {
      lines[0] = `原表 ${result.formRef} · 版本 ${result.formVersion} · 基线 ${result.baselineId}`
      for (const {fieldRef, cell} of result.mappings) {
        lines.push(`${fieldRef} · ${cell.rowRef} / ${cell.columnRef} · 栏意 ${cell.meaningRef} · 填写方 ${cell.fillerRef} · 显示规则 ${cell.displayRef}`)
        if (cell.unit) lines.push('单位 ' + cell.unit)
      }
    }
    await $page.showAlert(lines.join('\n'), '原表映射')
  } catch {
    if (isCurrent()) $page.showMessage('原表映射无法核验', 'warning')
  }
}

function bindOriginalAdoption() {
  const {adoptionCandidateRevisionId, adoptionRequestKey, adoptionRequestDigest, adoptionPreviewRef} = $route.query
  const visible = [adoptionCandidateRevisionId, adoptionRequestKey, adoptionRequestDigest, adoptionPreviewRef]
    .every(value => typeof value === 'string' && !!value && value.trim() === value)
  return {visible, disabled: !editorSession || editorFault}
}

async function openOriginalAdoption() {
  const {visible, disabled} = bindOriginalAdoption()
  if (!visible || disabled) return
  const {adoptionCandidateRevisionId, adoptionRequestKey, adoptionRequestDigest, adoptionPreviewRef} = $route.query
  const session = editorSession
  const keys = ['projectId', 'adoptionCandidateRevisionId', 'adoptionRequestKey', 'adoptionRequestDigest', 'adoptionPreviewRef']
  const selection = keys.map(key => $route.query[key])
  const isCurrent = () => editorSession === session && keys.every((key, index) => $route.query[key] === selection[index])
  try {
    const result = await session.readOriginalAdoption({candidateRevisionId: adoptionCandidateRevisionId,
      requestKey: adoptionRequestKey, requestDigest: adoptionRequestDigest, previewRef: adoptionPreviewRef})
    if (!isCurrent()) return
    result.assertCurrent()
    const lines = result.recordFound ? [`原采用记录 ${result.adoptionRef} · 修订 ${result.mergeRevisionId}`,
      result.commitCheckRef ? `登记引用的提交核验 ${result.commitCheckRef}` : '提交核验引用待补'] : ['未查到原采用记录']
    if (result.revisionEvidence === 'SNAPSHOT_VERIFIED') {
      lines.push(`已核合并修订快照 · 基线 ${result.baselineId} · 节点 ${result.nodeCount} 个`)
      if (result.rootHashVerified) lines.push(`已复算内容根摘要 ${result.rootHash}`)
      else lines.push(result.rootHashMismatch ? '内容根摘要与原修订登记不一致' : '内容根摘要待核')
    } else if (result.revisionEvidence === 'REVISION_READ') {
      lines.push('已回读合并修订，快照待核')
    } else if (result.revisionEvidence === 'UNVERIFIED') {
      lines.push('合并修订待核')
    }
    lines.push('原办理终态待核')
    let head
    try {
      head = await session.readCurrentHead()
      head.assertCurrent()
    } catch {
      head = undefined
    }
    if (!isCurrent()) return
    result.assertCurrent()
    lines.push(head ? `项目当前头 ${head.headRevisionId ?? '尚未形成'}` : '项目当前头待核')
    await $page.showAlert(lines.join('\n'), '原采用回查')
  } catch {
    if (isCurrent()) $page.showMessage('原采用记录无法核验', 'warning')
  }
}

function bindVolumePlanning() {
  return {disabled: !editorSession || editorFault}
}

async function openVolumePlanning() {
  if (bindVolumePlanning().disabled) return
  const session = editorSession
  const {projectId, draftId} = $route.query
  const isCurrent = () => editorSession === session && $route.query.projectId === projectId && $route.query.draftId === draftId
  try {
    const result = await session.readVolumePlanningObligations()
    if (!isCurrent()) return
    result.assertCurrent()
    const lines = ['项目激活基线 ' + result.baselineId]
    for (const item of result.obligations) {
      lines.push(`${item.obligationRef} · ${item.kind === 'DOCUMENT' ? '分册' : '独立递交'} · ${item.required ? '必交' : '按条件选用'} · 依据 ${item.sourceRef}`)
      if (item.allowedDisclosureRefs.length) lines.push('获准披露范围 ' + item.allowedDisclosureRefs.join('、'))
    }
    if (!result.obligations.length) lines.push('当前基线的递交事项待登记')
    await $page.showAlert(lines.join('\n'), '分册策划依据')
  } catch {
    if (isCurrent()) $page.showMessage('分册策划依据无法核验', 'warning')
  }
}

async function __init__() {
  const generation = ++initialization
  assertOriginalDraft = undefined
  selectedNodeId = null
  editorSession = undefined
  editorFault = false
  hostUnavailable = false
  saveReceipt = undefined
  saveReceiptError = false
  const query = $route.query
  const {projectId, draftId} = query
  const isEditorCurrent = () => generation === initialization &&
    $route.query.projectId === projectId && $route.query.draftId === draftId
  const receiptKeys = ['saveRequestKey', 'saveRequestDigest', 'saveContentDigest', 'saveExpectedDraftVersion']
  const keys = ['projectId', 'draftId', ...receiptKeys]
  const values = keys.map(key => query[key])
  const isCurrent = () => generation === initialization && keys.every((key, index) => $route.query[key] === values[index])
  saveReceiptSelection = isCurrent
  saveReceiptRequested = receiptKeys.some(key => Object.hasOwn(query, key))
  const {saveRequestKey, saveRequestDigest, saveContentDigest, saveExpectedDraftVersion} = query
  const id = value => typeof value === 'string' && !!value && value.trim() === value
  saveReceiptQueryValid = id(saveRequestKey) && (saveExpectedDraftVersion === null || id(saveExpectedDraftVersion)) &&
    [saveRequestDigest, saveContentDigest].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value))
  saveReceiptLoading = saveReceiptQueryValid
  try {
    const session = await $page.invokeHostCommand('content.authoring.connect')
    if (!isEditorCurrent()) return
    editorSession = session
  }
  catch (cause) {
    if (!isEditorCurrent()) return
    hostUnavailable = cause?.message === 'PAGE_HOST_COMMAND_UNAVAILABLE'
    editorFault = !hostUnavailable
  }
  if (!saveReceiptQueryValid || !editorSession || !isCurrent()) {
    saveReceiptLoading = false
    return
  }
  await readOriginalSave(query, isCurrent, generation)
}

function bindRefreshOriginalSave() {
  return {visible: saveReceiptQueryValid && saveReceiptSelection?.() === true,
    disabled: !editorSession || saveReceiptLoading}
}

async function refreshOriginalSave() {
  const {visible, disabled} = bindRefreshOriginalSave()
  if (!visible || disabled) return
  saveReceiptLoading = true
  saveReceiptError = false
  await readOriginalSave($route.query, saveReceiptSelection, initialization)
}

async function readOriginalSave(query, isCurrent, generation) {
  const {saveRequestKey, saveRequestDigest, saveContentDigest, saveExpectedDraftVersion} = query
  try {
    const receipt = await editorSession.readOriginalSave({requestKey: saveRequestKey, requestDigest: saveRequestDigest,
      contentDigest: saveContentDigest, expectedDraftVersion: saveExpectedDraftVersion})
    if (isCurrent()) saveReceipt = receipt
  } catch {
    if (isCurrent()) saveReceiptError = true
  } finally {
    if (generation === initialization) saveReceiptLoading = false
  }
}

function bindOriginalSave() {
  if (!saveReceiptRequested) return {visible: false}
  if (!saveReceiptSelection?.()) return {visible: false}
  if (!saveReceiptQueryValid) return {error: '原保存请求参数不完整或格式不正确'}
  if (saveReceiptLoading) return {status: '正在核验原保存结果'}
  if (saveReceiptError || !saveReceipt) return {error: '原保存结果无法核验'}
  try {
    saveReceipt.assertCurrent()
    if (saveReceipt.state === 'SAVED') {
      const status = `原请求已保存草稿版 ${saveReceipt.draftVersion}，回执 ${saveReceipt.receiptRef}`
      try {
        saveReceipt.comparison?.assertCurrent()
        if (saveReceipt.comparison?.localChanges) return {status: `${status}。当前编辑仍有本地未保存改动。`}
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
  if (!editorSession) return {}
  try {
    return {status: editorSession.canEditDraft ?
      '本页可暂存编辑。正式保存尚不可用，离页前可取消本次编辑。' : '当前草稿仅可查看。'}
  } catch {return {error: '正文编制会话已失效，请重新打开草稿'}}
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
    const assertResult = view.captureReadResult(), assertRow = view.captureReadRow(originalRow, [view.primaryKey, 'projectId', 'userId', 'draft'])
    assertOriginalDraft = () => {
      if ($page.resolveView(originalDraftKey) !== view || $route.query.projectId !== projectId ||
        $route.query.draftId !== draftId) throw Error('CONTENT_PAGE_RUNTIME_CHANGED')
      assertResult(); assertRow()
    }
  }
  assertOriginalDraft()
  return {view, projectId, draftId}
}

function bindDraftIdentity() {
  try {originalDraft(); return {value: '当前个人草稿'}}
  catch {return {visible: false}}
}

function bindContentNodeType() {
  const labels = {
    document: '逻辑册', chapter: '章节', heading: '标题', paragraph: '段落', list: '列表',
    item: '列表项', quote: '引文', table: '普通表', toc: '目录', caption: '题注', image: '图片',
  }
  return {displayFormatter: value => Object.hasOwn(labels, value) ? labels[value] : String(value)}
}

function bindOriginalDraft() {
  try {return {contextRowId: originalDraft().draftId}}
  catch {return {visible: false}}
}

function bindContentOutline() {
  try {
    const draft = originalDraft(), path = selectedNodePath(draft)
    return {outlineRootValue: draft.projectId, ...(path === null ? {} : {selectedPath: path})}
  }
  catch {return {visible: false}}
}

function selectedNodePath({view, draftId}) {
  if (selectedNodeId === null) return null
  const nodes = draftPayload(view, draftId).nodes
  if (!Array.isArray(nodes)) return null
  const index = nodes.findIndex(node => node?.nodeId === selectedNodeId)
  return index < 0 ? null : [index]
}

function draftPayload(view, draftId) {
  const raw = view.getEditingRow(draftId)?.draft
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('CONTENT_PAGE_ORIGINAL_DRAFT_REQUIRED')
  return value
}

function selectContentNode(path) {
  let current
  try {current = originalDraft()} catch {selectedNodeId = null; return}
  const {view, draftId} = current
  const draft = draftPayload(view, draftId)
  if (path !== null && (!Array.isArray(path) || path.length !== 1 || !Number.isSafeInteger(path[0]) || path[0] < 0
    || !Array.isArray(draft?.nodes) || !draft.nodes[path[0]])) throw Error('CONTENT_PAGE_SELECTION_REQUIRED')
  try {editorSession?.select()}
  catch (cause) {
    if (cause?.message === 'CONTENT_COMMAND_PENDING_INPUT') return
    throw cause
  }
  selectedNodeId = path === null ? null : draft.nodes[path[0]].nodeId
}

function bindAction(label) {
  try {
    const draft = originalDraft()
    if (!editorSession) return {visible: false}
    const action = editorSession.actionProps(label, selectedNodePath(draft))
    return {...action, onClick: () => {
      if ($route.query.projectId !== draft.projectId || $route.query.draftId !== draft.draftId) return
      action.onClick()
      selectedNodeId = null
    }}
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
  try {return {visible: !!editorSession, disabled: editorSession?.canCancel !== true}}
  catch {return {disabled: true}}
}
function cancelDraft() {
  if (bindCancel().disabled) return
  try {
    editorSession?.cancel()
    selectedNodeId = null
  } catch {
    $page.showMessage('当前草稿无法取消，未保存内容仍保留', 'warning')
  }
}

function bindSelectedNode() {
  try {
    const path = selectedNodePath(originalDraft())
    if (path === null) return {visible: false}
    if (editorSession?.canEditDraft) return editorSession.editorProps(path)
    return {valuePath: ['nodes', ...path]}
  } catch {return {visible: false}}
}
