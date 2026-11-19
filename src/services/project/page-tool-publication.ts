/**
 * @module app:services/project/page-tool-publication
 * 职责：在原浏览器保存三文件发布的恢复定位，跨工作区重开时按原节点和版本核对。
 * 边界：仅记录摘要、编号和已接纳回执的进度。文件内容、正式指针和数据权限均由原 DataView 读取。
 */
import type {DataView} from '@spark-appworks/spark-data'
import {LOWCODE_BLUEPRINT_FILE_NAMES as fileNames, lowcodeBlueprintFileVersionKey, type LowcodeBlueprintFileName} from '@spark-appworks/spark-lowcode-api'
import {isRecord} from '@spark-appworks/spark-utils'

type Progress = 'pending' | 'confirmed'
type Snapshot = Readonly<{version: number; state: Progress}>
type Publication = {
  call: string
  digest: string
  baseline: string
  snapshots: Partial<Record<LowcodeBlueprintFileName, Snapshot>>
  pointer: {value: string; state: Progress} | null
}
const active = new Set<string>()
const validState = (value: unknown): value is Progress => value === 'pending' || value === 'confirmed'

function decode(raw: string): Publication {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value) || typeof value['call'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['call'])
    || typeof value['digest'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['digest'])
    || typeof value['baseline'] !== 'string' || !isRecord(value['snapshots'])) throw Error('发布恢复记录不可读')
  const snapshots: Publication['snapshots'] = {}
  for (const [name, item] of Object.entries(value['snapshots'])) {
    const file = fileNames.find(candidate => name === candidate)
    if (!file || !isRecord(item) || typeof item['version'] !== 'number' || !Number.isSafeInteger(item['version'])
      || item['version'] <= 0 || !validState(item['state'])) throw Error('发布快照恢复定位无效')
    snapshots[file] = {version: item['version'], state: item['state']}
  }
  let pointer: Publication['pointer'] = null
  const saved = value['pointer']
  if (saved !== null) {
    if (!isRecord(saved)) throw Error('发布指针恢复定位无效')
    const {value: pointerValue, state} = saved
    if (typeof pointerValue !== 'string' || !validState(state)
      || !fileNames.every(file => snapshots[file]?.state === 'confirmed')
      || pointerValue !== fileNames.map(file => `${lowcodeBlueprintFileVersionKey(file)}=${snapshots[file]?.version}`).join(';')) {
      throw Error('发布指针恢复定位无效')
    }
    pointer = {value: pointerValue, state}
  }
  return {call: value['call'], digest: value['digest'], baseline: value['baseline'], snapshots, pointer}
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

  open(call: string, digest: string, baseline: string): Publication {
    const previous = this.raw === null ? null : decode(this.raw)
    if (previous?.pointer) throw Error('请先核验原发布指针')
    if (previous?.call === call && previous.digest === digest && previous.baseline === baseline) return previous
    if (previous && Object.values(previous.snapshots).some(snapshot => snapshot.state === 'pending')) {
      throw Error('原发布仍待核验，调用、内容或发布基线已经变化')
    }
    return {call, digest, baseline, snapshots: {}, pointer: null}
  }

  write(intent: Publication): void {
    if (this.storage.getItem(this.key) !== this.raw) throw Error('发布恢复记录已变化')
    const next = JSON.stringify(intent)
    this.storage.setItem(this.key, next)
    if (this.storage.getItem(this.key) !== next) throw Error('发布恢复定位未保存')
    this.raw = next
  }

  /** 核对原版本或追加并记录新版本；后续工作区只沿原文件 DataView 读取。 */
  async snapshot(input: Readonly<{intent: Publication; fileView: DataView; fileName: LowcodeBlueprintFileName; text: string;
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
