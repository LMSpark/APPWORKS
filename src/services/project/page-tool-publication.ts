/**
 * @module app:services/project/page-tool-publication
 * 职责：在原浏览器保存三文件发布的恢复定位，跨工作区重开时按原节点和版本核对。
 * 边界：仅记录摘要、编号和已接纳回执的进度。文件内容、正式指针和数据权限均由原 DataView 读取。
 */
import {parseRuntimeDataSetPlanFile as parseRuntimeDataSetPlan, type DataView} from '@spark-appworks/spark-data'
import {
  LOWCODE_BLUEPRINT_FILE_NAMES as fileNames,
  encodeLowcodeBlueprintFileVersions,
  lowcodeBlueprintFileVersionKey,
  parseLowcodeBlueprintFileVersions,
  type LowcodeBlueprintFileName,
} from '@spark-appworks/spark-lowcode-api'
import {isRecord} from '@spark-appworks/spark-utils'

type Progress = 'pending' | 'confirmed'
type Snapshot = Readonly<{version: number; state: Progress}>
type ScenarioSnapshot = Snapshot & Readonly<{sha256: string; sourceRevision: string; text: string}>
export type PageToolPublicationIntent = {
  call: string
  digest: string
  baseline: string
  snapshots: Partial<Record<LowcodeBlueprintFileName, Snapshot>>
  scenarioSnapshots: Record<string, ScenarioSnapshot>
  pointer: {value: string; state: Progress} | null
}
export type PageToolPublicationFileSource = Readonly<{fileName: 'rule.json'|'script.js'|'style.css'; version: number; text: string}>
export type PageToolPublicationScenarioSource = Readonly<{
  scenarioId: string
  version: number
  sourceRevision: string
  text: string
}>
export type PageToolPublicationPagedataSnapshot = Readonly<{
  scenarioId: string
  version: number
  fileName: string
  sha256: string
  sourceRevision: string
  text: string
}>
export type PageToolPublicationDatasetSnapshot = Readonly<{
  scenarioId: string
  fileName: string
  sha256: string
  sourceRevision: string
}>
type PageToolPublicationManifestCommon = Readonly<{
  format: 'spark-page-tool-publication'
  pageId: string
  scenarioIds: readonly string[]
  sourceRevision: string
  files: ReadonlyArray<Readonly<{fileName: PageToolPublicationFileSource['fileName']; version: number; sha256: string}>>
}>
export type PageToolPublicationManifest = PageToolPublicationManifestCommon & Readonly<
  {schemaVersion: 1; pagedata: readonly PageToolPublicationPagedataSnapshot[]; dataset?: never}
  | {schemaVersion: 2; dataset: readonly PageToolPublicationDatasetSnapshot[]; pagedata?: never}
>
const active = new Set<string>()
const validState = (value: unknown): value is Progress => value === 'pending' || value === 'confirmed'
const MANIFEST_FILE = 'publication-manifest.json' as const
const TOOL_FILES = ['rule.json', 'script.js', 'style.css'] as const
const digestPattern = /^[a-f0-9]{64}$/
const identity = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value === value.trim()

async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

function stableManifestSource(input: Readonly<{
  pageId: string
  scenarioIds: readonly string[]
  files: PageToolPublicationManifest['files']
  pagedata?: readonly PageToolPublicationPagedataSnapshot[]
  dataset?: readonly PageToolPublicationDatasetSnapshot[]
}>): string {
  return JSON.stringify({
    pageId: input.pageId,
    scenarioIds: [...input.scenarioIds],
    files: input.files.map(file => ({fileName: file.fileName, version: file.version, sha256: file.sha256})),
    ...(input.pagedata === undefined ? {} : {pagedata: input.pagedata.map(item => ({
      scenarioId: item.scenarioId, version: item.version, fileName: item.fileName,
      sha256: item.sha256, sourceRevision: item.sourceRevision, text: item.text,
    }))}),
    ...(input.dataset === undefined ? {} : {dataset: input.dataset.map(item => ({
      scenarioId: item.scenarioId, fileName: item.fileName,
      sha256: item.sha256, sourceRevision: item.sourceRevision,
    }))}),
  })
}

/** Builds the immutable fourth-file payload from owner-confirmed file and scenario snapshots. */
export async function createPageToolPublicationManifest(input: Readonly<{
  pageId: string
  files: readonly PageToolPublicationFileSource[]
  pagedata: readonly PageToolPublicationScenarioSource[]
}>): Promise<PageToolPublicationManifest> {
  if (!identity(input.pageId)) throw Error('发布 manifest 缺少有效 pageId')
  const includedFileNames = new Set<string>(), files: Array<PageToolPublicationManifest['files'][number]> = []
  for (const file of input.files) {
    if (!TOOL_FILES.some(name => name === file.fileName) || includedFileNames.has(file.fileName)
      || !Number.isSafeInteger(file.version) || file.version < 1) throw Error('发布 manifest 工具快照无效')
    includedFileNames.add(file.fileName)
    files.push(Object.freeze({fileName: file.fileName, version: file.version, sha256: await sha256(file.text)}))
  }
  if (files.length !== TOOL_FILES.length || TOOL_FILES.some(name => !includedFileNames.has(name))) throw Error('发布 manifest 工具快照不完整')
  const scenarioIds: string[] = [], scenarios = new Set<string>()
  const pagedata: PageToolPublicationPagedataSnapshot[] = []
  for (const source of input.pagedata) {
    if (!identity(source.scenarioId) || scenarios.has(source.scenarioId)
      || !Number.isSafeInteger(source.version) || source.version < 0 || !identity(source.sourceRevision)) {
      throw Error('发布 manifest 场景快照无效')
    }
    scenarios.add(source.scenarioId)
    scenarioIds.push(source.scenarioId)
    pagedata.push(Object.freeze({
      scenarioId: source.scenarioId, version: source.version, fileName: `${source.version}__pagedata.json`,
      sourceRevision: source.sourceRevision, sha256: await sha256(source.text), text: source.text,
    }))
  }
  const stable = [...pagedata].sort((left, right) => left.scenarioId.localeCompare(right.scenarioId))
  const sortedFiles = [...files].sort((left, right) => TOOL_FILES.indexOf(left.fileName) - TOOL_FILES.indexOf(right.fileName))
  const manifest = {
    pageId: input.pageId, scenarioIds: [...scenarioIds],
    files: sortedFiles, pagedata: stable,
  }
  const sourceRevision = await sha256(stableManifestSource(manifest))
  return Object.freeze({...manifest, format: 'spark-page-tool-publication' as const, schemaVersion: 1 as const, sourceRevision})
}

/** Build a v2 publication proof from a backend-owned independent Dataset Plan without creating Dataset versions. */
export async function createPageToolDatasetPublicationManifest(input: Readonly<{
  pageId: string
  files: readonly PageToolPublicationFileSource[]
  dataset: ReadonlyArray<Readonly<{scenarioId: string; sourceRevision: string; text: string}>>
}>): Promise<PageToolPublicationManifest> {
  if (!identity(input.pageId)) throw Error('发布 manifest 缺少有效 pageId')
  const includedFileNames = new Set<string>(), files: Array<PageToolPublicationManifest['files'][number]> = []
  for (const file of input.files) {
    if (!TOOL_FILES.some(name => name === file.fileName) || includedFileNames.has(file.fileName)
      || !Number.isSafeInteger(file.version) || file.version < 1) throw Error('发布 manifest 工具快照无效')
    includedFileNames.add(file.fileName)
    files.push(Object.freeze({fileName: file.fileName, version: file.version, sha256: await sha256(file.text)}))
  }
  if (files.length !== TOOL_FILES.length || TOOL_FILES.some(name => !includedFileNames.has(name))) {
    throw Error('发布 manifest 工具快照不完整')
  }
  const scenarioIds: string[] = [], dataset: PageToolPublicationDatasetSnapshot[] = [], seen = new Set<string>()
  for (const source of input.dataset) {
    if (!identity(source.scenarioId) || !identity(source.sourceRevision) || seen.has(source.scenarioId)) {
      throw Error('发布 manifest Dataset proof 身份无效')
    }
    parseRuntimeDataSetPlan(source.text, source.scenarioId)
    seen.add(source.scenarioId)
    scenarioIds.push(source.scenarioId)
    dataset.push(Object.freeze({scenarioId: source.scenarioId, fileName: `${source.scenarioId}.dataset.json`,
      sha256: await sha256(source.text), sourceRevision: source.sourceRevision}))
  }
  const stable = [...dataset].sort((left, right) => left.scenarioId.localeCompare(right.scenarioId))
  const sortedFiles = [...files].sort((left, right) => TOOL_FILES.indexOf(left.fileName) - TOOL_FILES.indexOf(right.fileName))
  const manifest = {pageId: input.pageId, scenarioIds: [...scenarioIds], files: sortedFiles, dataset: stable}
  const sourceRevision = await sha256(stableManifestSource(manifest))
  return Object.freeze({...manifest, format: 'spark-page-tool-publication' as const, schemaVersion: 2 as const, sourceRevision})
}

/** Parses and verifies the complete manifest contract without accepting additional ambiguity. */
export async function parsePageToolPublicationManifest(text: string): Promise<PageToolPublicationManifest> {
  const value: unknown = JSON.parse(text)
  if (!isRecord(value) || value['format'] !== 'spark-page-tool-publication'
    || value['schemaVersion'] !== 1 && value['schemaVersion'] !== 2
    || !identity(value['pageId']) || !digestPattern.test(String(value['sourceRevision']))
    || !Array.isArray(value['scenarioIds']) || !Array.isArray(value['files'])) {
    throw Error('发布 manifest 格式无效')
  }
  const scenarioIds = value['scenarioIds']
  if (scenarioIds.some(id => !identity(id)) || new Set(scenarioIds).size !== scenarioIds.length) {
    throw Error('发布 manifest 场景集合无效')
  }
  const rawFiles = value['files']
  const files: Array<PageToolPublicationManifest['files'][number]> = []
  for (const item of rawFiles) {
    const fileName = isRecord(item) ? TOOL_FILES.find(name => name === item['fileName']) : undefined
    if (fileName === undefined || !isRecord(item)
      || typeof item['version'] !== 'number' || !Number.isSafeInteger(item['version']) || item['version'] < 1
      || !digestPattern.test(String(item['sha256'])) || files.some(file => file.fileName === item['fileName'])) {
      throw Error('发布 manifest 工具快照无效')
    }
    files.push({fileName,
      version: item['version'], sha256: String(item['sha256'])})
  }
  if (files.length !== TOOL_FILES.length) throw Error('发布 manifest 工具快照不完整')
  if (value['schemaVersion'] === 1) {
    if (!Array.isArray(value['pagedata']) || value['dataset'] !== undefined) throw Error('发布 manifest pagedata 快照无效')
    const pagedata: PageToolPublicationPagedataSnapshot[] = []
    for (const item of value['pagedata']) {
      if (!isRecord(item) || !identity(item['scenarioId']) || typeof item['version'] !== 'number'
        || !Number.isSafeInteger(item['version']) || item['version'] < 0 || item['fileName'] !== `${item['version']}__pagedata.json`
        || !digestPattern.test(String(item['sha256'])) || !identity(item['sourceRevision']) || typeof item['text'] !== 'string'
        || pagedata.some(snapshot => snapshot.scenarioId === item['scenarioId']) || !scenarioIds.includes(item['scenarioId'])) {
        throw Error('发布 manifest pagedata 快照无效')
      }
      if (await sha256(item['text']) !== item['sha256']) throw Error('发布 manifest pagedata sha256 不一致')
      pagedata.push({
        scenarioId: item['scenarioId'], version: item['version'], fileName: String(item['fileName']),
        sha256: String(item['sha256']), sourceRevision: item['sourceRevision'], text: item['text'],
      })
    }
    if (pagedata.length !== scenarioIds.length) throw Error('发布 manifest pagedata 快照不完整')
    const parsed: PageToolPublicationManifest = {
      format: 'spark-page-tool-publication', schemaVersion: 1, pageId: value['pageId'], scenarioIds,
      sourceRevision: String(value['sourceRevision']), files, pagedata,
    }
    if (await sha256(stableManifestSource(parsed)) !== parsed.sourceRevision) throw Error('发布 manifest sourceRevision 不一致')
    return Object.freeze(parsed)
  }
  if (!Array.isArray(value['dataset']) || value['pagedata'] !== undefined) throw Error('发布 manifest Dataset proof 无效')
  const dataset: PageToolPublicationDatasetSnapshot[] = []
  for (const item of value['dataset']) {
    if (!isRecord(item) || !identity(item['scenarioId']) || item['fileName'] !== `${item['scenarioId']}.dataset.json`
      || !digestPattern.test(String(item['sha256'])) || !identity(item['sourceRevision']) || item['text'] !== undefined
      || dataset.some(snapshot => snapshot.scenarioId === item['scenarioId']) || !scenarioIds.includes(item['scenarioId'])) {
      throw Error('发布 manifest Dataset proof 无效')
    }
    dataset.push({scenarioId: item['scenarioId'], fileName: String(item['fileName']),
      sha256: String(item['sha256']), sourceRevision: item['sourceRevision']})
  }
  if (dataset.length !== scenarioIds.length) throw Error('发布 manifest Dataset proof 不完整')
  const parsed: PageToolPublicationManifest = {
    format: 'spark-page-tool-publication', schemaVersion: 2, pageId: value['pageId'], scenarioIds,
    sourceRevision: String(value['sourceRevision']), files, dataset,
  }
  if (await sha256(stableManifestSource(parsed)) !== parsed.sourceRevision) throw Error('发布 manifest sourceRevision 不一致')
  return Object.freeze(parsed)
}

function decode(raw: string): PageToolPublicationIntent {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value) || typeof value['call'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['call'])
    || typeof value['digest'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['digest'])
    || typeof value['baseline'] !== 'string' || !isRecord(value['snapshots'])) throw Error('发布恢复记录不可读')
  const snapshots: PageToolPublicationIntent['snapshots'] = {}
  for (const [name, item] of Object.entries(value['snapshots'])) {
    const file = fileNames.find(candidate => name === candidate)
    if (!file || !isRecord(item) || typeof item['version'] !== 'number' || !Number.isSafeInteger(item['version'])
      || item['version'] <= 0 || !validState(item['state'])) throw Error('发布快照恢复定位无效')
    snapshots[file] = {version: item['version'], state: item['state']}
  }
  const scenarioSnapshots: PageToolPublicationIntent['scenarioSnapshots'] = {}
  const rawScenarios = value['scenarioSnapshots']
  if (rawScenarios !== undefined) {
    if (!isRecord(rawScenarios)) throw Error('发布场景快照恢复定位无效')
    for (const [scenarioId, item] of Object.entries(rawScenarios)) {
      if (!identity(scenarioId) || !isRecord(item) || typeof item['version'] !== 'number' || !Number.isSafeInteger(item['version'])
        || item['version'] < 0 || !validState(item['state']) || !digestPattern.test(String(item['sha256']))
        || !identity(item['sourceRevision']) || typeof item['text'] !== 'string') throw Error('发布场景快照恢复定位无效')
      scenarioSnapshots[scenarioId] = {
        version: item['version'], state: item['state'], sha256: String(item['sha256']),
        sourceRevision: item['sourceRevision'], text: item['text'],
      }
    }
  }
  let pointer: PageToolPublicationIntent['pointer'] = null
  const saved = value['pointer']
  if (saved !== null) {
    if (!isRecord(saved)) throw Error('发布指针恢复定位无效')
    const {value: pointerValue, state} = saved
    if (typeof pointerValue !== 'string' || !validState(state)) {
      throw Error('发布指针恢复定位无效')
    }
    const parsed = parseLowcodeBlueprintFileVersions(pointerValue)
    const required = parsed.manifest === null
      ? fileNames.filter(file => file !== MANIFEST_FILE)
      : fileNames
    if (!required.every(file => snapshots[file]?.state === 'confirmed')
      || encodeLowcodeBlueprintFileVersions(parsed) !== pointerValue) throw Error('发布指针恢复定位无效')
    for (const file of required) {
      if (snapshots[file]?.version !== parsed[lowcodeBlueprintFileVersionKey(file)]) throw Error('发布指针恢复定位无效')
    }
    pointer = {value: pointerValue, state}
  }
  return {call: value['call'], digest: value['digest'], baseline: value['baseline'], snapshots, scenarioSnapshots, pointer}
}

export class PageToolPublication {
  private raw: string | null

  constructor(private readonly storage: Storage, private readonly key: string) {
    this.raw = storage.getItem(key)
  }

  /** 指针有正式回执后只需原调用与蓝图行，工作文件可已进入下一次编辑。 */
  confirmedPointer(call: string): string | undefined {
    const previous = this.raw === null ? null : decode(this.raw)
    if (!previous?.pointer) return undefined
    if (previous.pointer.state === 'pending') throw Error('原发布指针已尝试提交，尚无权威回执，请在原工作区核验')
    if (previous.call !== call) throw Error('原发布指针所属调用已变化')
    return previous.pointer.value
  }

  open(call: string, digest: string, baseline: string): PageToolPublicationIntent {
    const previous = this.raw === null ? null : decode(this.raw)
    if (previous?.pointer) throw Error('请先核验原发布指针')
    if (previous?.call === call && previous.digest === digest && previous.baseline === baseline) return previous
    if (previous && Object.values(previous.snapshots).some(snapshot => snapshot.state === 'pending')) {
      throw Error('原发布仍待核验，调用、内容或发布基线已经变化')
    }
    return {call, digest, baseline, snapshots: {}, scenarioSnapshots: {}, pointer: null}
  }

  write(intent: PageToolPublicationIntent): void {
    if (this.storage.getItem(this.key) !== this.raw) throw Error('发布恢复记录已变化')
    const next = JSON.stringify(intent)
    this.storage.setItem(this.key, next)
    if (this.storage.getItem(this.key) !== next) throw Error('发布恢复定位未保存')
    this.raw = next
  }

  /** 核对原版本或追加并记录新版本；后续工作区只沿原文件 DataView 读取。 */
  async snapshot(input: Readonly<{intent: PageToolPublicationIntent; fileView: DataView; fileName: LowcodeBlueprintFileName; text: string;
    assertTarget(): void; onAttempt(name: string): void}>): Promise<number> {
    const {intent, fileView, fileName, text, assertTarget} = input
    let snapshot = intent.snapshots[fileName]
    if (snapshot) {
      const versionName = `${snapshot.version}__${fileName}`
      if (snapshot.state === 'pending') {
        const versions = await fileView.listSourceVersions()
        assertTarget()
        if (!versions.some(item => item.version === snapshot?.version && item.label === versionName)) {
          throw new Error(`${versionName} 原快照仍待核验`)
        }
      }
      if (await fileView.previewSourceVersion(snapshot.version) !== text) {
        throw new Error(`${fileName} 原快照与本次发布内容不符`)
      }
      assertTarget()
      const status = fileView.getSourceHistoryStatus()
      if (snapshot.state === 'pending') {
        if (status.state === 'unknown' && status.fileName === versionName) {
          const verified = await fileView.verifySourceHistoryAttempt()
          if (verified.state !== 'confirmed') throw new Error(`${versionName} 原文件回执仍待核验`)
        }
        snapshot = {version: snapshot.version, state: 'confirmed'}
        intent.snapshots[fileName] = snapshot
        this.write(intent)
      }
      if (status.fileName === versionName && (status.state === 'confirmed' || status.state === 'unknown')) {
        fileView.acknowledgeSourceHistoryAttempt()
      }
    } else {
      let capturedVersion: number | undefined
      const history=await fileView.createSourceVersion(attempt=>{
        if (typeof attempt.version !== 'number' || !Number.isSafeInteger(attempt.version) || attempt.version < 1
          || attempt.fileName !== `${attempt.version}__${fileName}`) throw new Error('原快照版本身份无效')
        capturedVersion = attempt.version
        intent.snapshots[fileName] = {version: attempt.version, state: 'pending'}
        this.write(intent)
        input.onAttempt(attempt.fileName)
      }).catch(error => {
        if (capturedVersion !== undefined) {
          const status = fileView.getSourceHistoryStatus()
          if (status.state === 'not-applied' && status.version === capturedVersion) {
            Reflect.deleteProperty(intent.snapshots,fileName)
            this.write(intent)
          }
        }
        throw error
      })
      if(history.state!=='confirmed'||typeof history.version!=='number'||!Number.isSafeInteger(history.version)||history.version<1
        || history.fileName!==`${history.version}__${fileName}` || (capturedVersion !== undefined && capturedVersion !== history.version)) {
        throw new Error(`${fileName} 文件 DataView 未确认快照回执`)
      }
      if (capturedVersion === undefined && await fileView.previewSourceVersion(history.version) !== text) {
        throw new Error(`${fileName} 待读取的原快照不属于本次内容`)
      }
      assertTarget()
      snapshot = {version: history.version, state: 'confirmed'}
      intent.snapshots[fileName] = snapshot
      this.write(intent)
      fileView.acknowledgeSourceHistoryAttempt()
    }
    return snapshot.version
  }

  /** Creates or verifies the existing ScenarioViewFile/DataView owner's immutable pagedata snapshot. */
  async scenarioSnapshot(input: Readonly<{
    intent: PageToolPublicationIntent
    scenarioId: string
    fileView: DataView
    text: string
    sourceRevision: string
    assertTarget(): void
    onAttempt(name: string): void
  }>): Promise<PageToolPublicationScenarioSource> {
    const {intent, scenarioId, fileView, text, sourceRevision, assertTarget} = input
    if (!identity(scenarioId) || !identity(sourceRevision)) throw Error('场景发布快照身份无效')
    let snapshot = intent.scenarioSnapshots[scenarioId]
    if (snapshot) {
      if (snapshot.text !== text || snapshot.sourceRevision !== sourceRevision || snapshot.sha256 !== await sha256(text)) {
        throw Error(`${scenarioId} 原场景快照与本次发布内容不符`)
      }
      const versionName = `${snapshot.version}__pagedata.json`
      if (snapshot.state === 'pending') {
        const versions = await fileView.listSourceVersions()
        assertTarget()
        if (!versions.some(item => item.version === snapshot?.version && item.label === versionName)) {
          throw new Error(`${scenarioId}/${versionName} 原快照仍待核验`)
        }
      }
      if (await fileView.previewSourceVersion(snapshot.version) !== text) throw new Error(`${scenarioId} 原快照与本次发布内容不符`)
      assertTarget()
      const status = fileView.getSourceHistoryStatus()
      if (snapshot.state === 'pending') {
        if (status.state === 'unknown' && status.fileName === versionName) {
          const verified = await fileView.verifySourceHistoryAttempt()
          if (verified.state !== 'confirmed') throw new Error(`${scenarioId}/${versionName} 原文件回执仍待核验`)
        }
        snapshot = {...snapshot, state: 'confirmed'}
        intent.scenarioSnapshots[scenarioId] = snapshot
        this.write(intent)
      }
      if (status.fileName === versionName && (status.state === 'confirmed' || status.state === 'unknown')) {
        fileView.acknowledgeSourceHistoryAttempt()
      }
    } else {
      const shaValue = await sha256(text)
      let capturedVersion: number | undefined
      const history = await fileView.createSourceVersion(attempt => {
        if (typeof attempt.version !== 'number' || !Number.isSafeInteger(attempt.version) || attempt.version < 0
          || attempt.fileName !== `${attempt.version}__pagedata.json`) throw new Error('场景原快照版本身份无效')
        capturedVersion = attempt.version
        intent.scenarioSnapshots[scenarioId] = {version: attempt.version, state: 'pending',
          sha256: shaValue, sourceRevision, text}
        this.write(intent)
        input.onAttempt(attempt.fileName)
      }).catch(error => {
        if (capturedVersion !== undefined) {
          const status = fileView.getSourceHistoryStatus()
          if (status.state === 'not-applied' && status.version === capturedVersion) {
            Reflect.deleteProperty(intent.scenarioSnapshots, scenarioId)
            this.write(intent)
          }
        }
        throw error
      })
      if (history.state !== 'confirmed' || typeof history.version !== 'number' || !Number.isSafeInteger(history.version)
        || history.version < 0 || history.fileName !== `${history.version}__pagedata.json`
        || (capturedVersion !== undefined && capturedVersion !== history.version)) {
        throw new Error(`${scenarioId} 场景 DataView 未确认快照回执`)
      }
      assertTarget()
      if (capturedVersion === undefined && await fileView.previewSourceVersion(history.version) !== text) {
        throw new Error(`${scenarioId} 待读取的原场景快照不属于本次内容`)
      }
      snapshot = {version: history.version, state: 'confirmed', sha256: shaValue, sourceRevision, text}
      intent.scenarioSnapshots[scenarioId] = snapshot
      this.write(intent)
      fileView.acknowledgeSourceHistoryAttempt()
    }
    return {scenarioId, version: snapshot.version, sourceRevision, text}
  }

  finish(): void {
    if (this.storage.getItem(this.key) !== this.raw) throw Error('发布恢复记录已变化')
    this.storage.removeItem(this.key)
  }

  /** 原工作区的回读重试也取得同一节点的发布锁，核对期间不能接管新意图。 */
  async resume(run: () => Promise<void>): Promise<void> {
    await withPublicationLock(this.key, async storage => {
      if (storage !== this.storage || storage.getItem(this.key) !== this.raw) throw Error('原发布恢复定位已变化')
      await run()
    })
  }
}

/** 支持 Web Locks 的浏览器跨标签页互斥；其他宿主只在当前标签页保存续办定位。 */
export async function withPageToolPublication(owner: readonly string[], run: (journal: PageToolPublication) => Promise<void>): Promise<void> {
  if (owner.some(part => !part.trim())) throw Error('发布恢复定位缺少租户、用户、应用或节点身份')
  const key = JSON.stringify(['spark:page-tool-publication:v1', ...owner])
  await withPublicationLock(key, storage => run(new PageToolPublication(storage, key)))
}

async function withPublicationLock(key: string, run: (storage: Storage) => Promise<void>): Promise<void> {
  if (active.has(key)) throw Error('同一节点正在发布')
  active.add(key)
  try {
    if ('locks' in navigator && typeof navigator.locks.request === 'function') {
      await navigator.locks.request(key, {ifAvailable: true}, async lock => {
        if (!lock) throw Error('另一标签页正在发布此节点')
        await run(window.localStorage)
      })
    } else {
      await run(window.sessionStorage)
    }
  } finally { active.delete(key) }
}
