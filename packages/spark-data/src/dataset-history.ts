/**
 * @module @spark-appworks/spark-data:dataset-history
 * 职责：提供数据层 dataset-history 能力，围绕 DataSetHistoryStorageAdapter、DataSetHistoryScope、DataSetSnapshotSelector 等 7 个公开契约 描述 DataSet、DataTable、DataView、策略委托或数据绑定键。
 * 边界：保持框架无关，只处理数据模型、校验和本地策略，不依赖 Vue、路由或 Element Plus。
 * AI用途：生成页面数据绑定、DataViewKey 或数据策略调用时，用本模块确认 dataset-history 的数据语义。
 */
import { deepClone, isRecord } from '@spark-appworks/spark-utils'

import type { DataSetContract, DataSetMetadata } from './types'

const DEFAULT_HISTORY_NAMESPACE = 'spark:data-history'
const DEFAULT_HISTORY_LIMIT = 20

/** Data Set History Storage Adapter 的语义模型。 */
export type DataSetHistoryStorageAdapter = {
  /** 按存储键读取持久化内容；键不存在时返回 null。 */
  getItem(key: string): string | null
  /** 将键值对写入持久化存储；覆盖同名键的已有值。 */
  setItem(key: string, value: string): void
  /** 按存储键删除持久化内容；键不存在时静默忽略。 */
  removeItem(key: string): void}

/** Data Set History Scope 的语义模型。 */
export type DataSetHistoryScope = {
    /** data Set Name 名称。 */
dataSetName?: string
    /** page Id 标识。 */
pageId?: string
    /** scope Id 标识。 */
scopeId?: string
    /** namespace 字段。 */
namespace?: string}

/** Data Set Snapshot Selector 的语义模型。 */
export type DataSetSnapshotSelector = {
    /** entry Id 标识。 */
entryId?: string
    /** version 字段。 */
version?: number}

/** Data Set History Snapshot 的语义模型。 */
export type DataSetHistorySnapshot = {
    /** 唯一标识。 */
id: string
    /** version 字段。 */
version: number
    /** 事件时间戳。 */
timestamp: number
    /** data Set Name 名称。 */
dataSetName: string
    /** page Id 标识。 */
pageId?: string
    /** 展示标签。 */
label?: string
    /** summary 字段。 */
summary?: string
    /** snapshot 字段。 */
snapshot: DataSetMetadata
    /** source Data 字段。 */
sourceData?: Record<string, unknown>}

/** Data Set History List Options 的调用配置。 */
export type DataSetHistoryListOptions = DataSetHistoryScope & {
    /** adapter 字段。 */
adapter?: DataSetHistoryStorageAdapter | null}

/** Data Set Snapshot Commit Options 的调用配置。 */
export type DataSetSnapshotCommitOptions = DataSetHistoryListOptions & {
    /** max Entries 字段。 */
maxEntries?: number
        /** 展示标签。 */
label?: string
        /** summary 字段。 */
summary?: string
        /** source Data 字段。 */
sourceData?: Record<string, unknown>
        /** version 字段。 */
version?: number
        /** 事件时间戳。 */
timestamp?: number}

/** Data Set Commit Snapshot Options 的调用配置。 */
export type DataSetCommitSnapshotOptions = Omit<DataSetSnapshotCommitOptions, 'version'> & {
    /** bump Version 字段。 */
bumpVersion?: boolean}

type DataSetHistoryEnvelope = {
  entries: DataSetHistorySnapshot[]
  nextSlot: number
  capacity: number}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function compareEntriesByNewest(left: DataSetHistorySnapshot, right: DataSetHistorySnapshot): number {
  if (right.timestamp !== left.timestamp) {
    return right.timestamp - left.timestamp
  }
  return right.version - left.version
}

function compareEntriesByOldest(left: DataSetHistorySnapshot, right: DataSetHistorySnapshot): number {
  if (left.timestamp !== right.timestamp) {
    return left.timestamp - right.timestamp
  }
  return left.version - right.version
}

function normalizeHistoryCapacity(value: unknown, fallback = DEFAULT_HISTORY_LIMIT): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.trunc(value))
  }
  return Math.max(1, Math.trunc(fallback))
}

function normalizeNextSlot(value: unknown, entriesLength: number, capacity: number): number {
  if (entriesLength >= capacity) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.trunc(value) % capacity
    }
    return 0
  }

  return entriesLength
}

function sortEntriesByNewest(entries: DataSetHistorySnapshot[]): DataSetHistorySnapshot[] {
  return entries.slice().sort(compareEntriesByNewest)
}

function sortEntriesByOldest(entries: DataSetHistorySnapshot[]): DataSetHistorySnapshot[] {
  return entries.slice().sort(compareEntriesByOldest)
}

function resizeEnvelope(envelope: DataSetHistoryEnvelope, capacity: number): DataSetHistoryEnvelope {
  const resolvedCapacity = normalizeHistoryCapacity(capacity)
  const keptEntries = sortEntriesByNewest(envelope.entries).slice(0, resolvedCapacity)
  const orderedEntries = sortEntriesByOldest(keptEntries)

  return {
    entries: orderedEntries,
    nextSlot: orderedEntries.length < resolvedCapacity ? orderedEntries.length : 0,
    capacity: resolvedCapacity,
  }
}

function appendEntryToEnvelope(
  envelope: DataSetHistoryEnvelope,
  entry: DataSetHistorySnapshot,
): DataSetHistoryEnvelope {
  const entries = envelope.entries.slice()

  if (entries.length < envelope.capacity) {
    const insertIndex = Math.min(Math.max(envelope.nextSlot, 0), entries.length)
    entries.splice(insertIndex, 0, entry)
    return {
      entries,
      nextSlot: entries.length < envelope.capacity ? entries.length : 0,
      capacity: envelope.capacity,
    }
  }

  const slot = normalizeNextSlot(envelope.nextSlot, entries.length, envelope.capacity)
  entries[slot] = entry

  return {
    entries,
    nextSlot: (slot + 1) % envelope.capacity,
    capacity: envelope.capacity,
  }
}

function buildHistoryScope(scope: DataSetHistoryScope): DataSetHistoryScope {
  return {
    ...(scope.dataSetName !== undefined ? { dataSetName: scope.dataSetName } : {}),
    ...(scope.pageId !== undefined ? { pageId: scope.pageId } : {}),
    ...(scope.scopeId !== undefined ? { scopeId: scope.scopeId } : {}),
    ...(scope.namespace !== undefined ? { namespace: scope.namespace } : {}),
  }
}

function resolveAdapter(adapter?: DataSetHistoryStorageAdapter | null): DataSetHistoryStorageAdapter | null {
  return adapter ?? createLocalStorageHistoryAdapter()
}

function normalizeEnvelope(value: unknown): DataSetHistoryEnvelope {
  if (!isRecord(value)) {
    return { entries: [], nextSlot: 0, capacity: DEFAULT_HISTORY_LIMIT }
  }
  const rawEntries = value['entries']
  if (!Array.isArray(rawEntries)) {
    return { entries: [], nextSlot: 0, capacity: DEFAULT_HISTORY_LIMIT }
  }

  const entries = rawEntries.filter((entry): entry is DataSetHistorySnapshot => {
    if (!isRecord(entry)) return false
    return isNonEmptyString(entry['id'])
      && typeof entry['version'] === 'number'
      && typeof entry['timestamp'] === 'number'
      && isNonEmptyString(entry['dataSetName'])
      && isRecord(entry['snapshot'])
  })

  const rawCapacity = value['capacity']
  const resolvedCapacity = normalizeHistoryCapacity(rawCapacity, Math.max(entries.length, DEFAULT_HISTORY_LIMIT))
  const trimmedEntries = entries.slice(0, resolvedCapacity)

  if (typeof value['nextSlot'] === 'number') {
    return {
      entries: trimmedEntries,
      nextSlot: normalizeNextSlot(value['nextSlot'], trimmedEntries.length, resolvedCapacity),
      capacity: resolvedCapacity,
    }
  }

  return {
    entries: sortEntriesByOldest(trimmedEntries),
    nextSlot: trimmedEntries.length < resolvedCapacity ? trimmedEntries.length : 0,
    capacity: resolvedCapacity,
  }
}

function readEnvelope(key: string, adapter: DataSetHistoryStorageAdapter): DataSetHistoryEnvelope {
  const raw = adapter.getItem(key)
  if (!raw) {
    return {
      entries: [],
      nextSlot: 0,
      capacity: DEFAULT_HISTORY_LIMIT,
    }
  }
  try {
    return normalizeEnvelope(JSON.parse(raw))
  } catch {
    return {
      entries: [],
      nextSlot: 0,
      capacity: DEFAULT_HISTORY_LIMIT,
    }
  }
}

function writeEnvelope(key: string, adapter: DataSetHistoryStorageAdapter, envelope: DataSetHistoryEnvelope): void {
  if (envelope.entries.length === 0) {
    adapter.removeItem(key)
    return
  }
  adapter.setItem(key, JSON.stringify(envelope))
}

function toSnapshot(dataSetOrSnapshot: DataSetContract | DataSetMetadata): DataSetMetadata {
  return 'toJson' in dataSetOrSnapshot
    ? deepClone(dataSetOrSnapshot.toJson())
    : deepClone(dataSetOrSnapshot)
}

function getLatestVersion(entries: DataSetHistorySnapshot[]): number {
  let maxVersion = 0
  for (const entry of entries) {
    if (entry.version > maxVersion) {
      maxVersion = entry.version
    }
  }
  return maxVersion
}

export function createLocalStorageHistoryAdapter(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): DataSetHistoryStorageAdapter | null {
  const resolvedStorage = storage
    ?? (typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? globalThis.localStorage
      : undefined)

  if (!resolvedStorage) return null

  return {
    getItem(key: string): string | null {
      return resolvedStorage.getItem(key)
    },
    setItem(key: string, value: string): void {
      resolvedStorage.setItem(key, value)
    },
    removeItem(key: string): void {
      resolvedStorage.removeItem(key)
    },
  }
}

export function resolveDataSetHistoryKey(scope: DataSetHistoryScope): string {
  const identity = scope.scopeId ?? scope.pageId ?? scope.dataSetName
  if (!isNonEmptyString(identity)) {
    throw new Error('DataSet history key requires scopeId, pageId or dataSetName')
  }

  const namespace = isNonEmptyString(scope.namespace)
    ? scope.namespace
    : DEFAULT_HISTORY_NAMESPACE
  return `${namespace}:${identity.trim()}`
}

export function listDataSetSnapshots(
  scope: DataSetHistoryScope,
  options?: DataSetHistoryListOptions,
): DataSetHistorySnapshot[] {
  const adapter = resolveAdapter(options?.adapter)
  if (!adapter) return []

  const key = resolveDataSetHistoryKey(buildHistoryScope({
    ...(scope.dataSetName !== undefined ? { dataSetName: scope.dataSetName } : {}),
    ...(scope.pageId !== undefined ? { pageId: scope.pageId } : {}),
    ...(scope.scopeId !== undefined ? { scopeId: scope.scopeId } : {}),
    ...(options?.namespace !== undefined
      ? { namespace: options.namespace }
      : scope.namespace !== undefined
        ? { namespace: scope.namespace }
        : {}),
  }))
  return sortEntriesByNewest(readEnvelope(key, adapter).entries)
}

export function getDataSetSnapshot(
  scope: DataSetHistoryScope,
  selector: DataSetSnapshotSelector,
  options?: DataSetHistoryListOptions,
): DataSetHistorySnapshot | null {
  const entries = listDataSetSnapshots(scope, options)
  if (isNonEmptyString(selector.entryId)) {
    return entries.find((entry) => entry.id === selector.entryId) ?? null
  }
  if (typeof selector.version === 'number') {
    return entries.find((entry) => entry.version === selector.version) ?? null
  }
  return entries[0] ?? null
}

export function commitDataSetSnapshot(
  dataSetOrSnapshot: DataSetContract | DataSetMetadata,
  options?: DataSetSnapshotCommitOptions,
): DataSetHistorySnapshot | null {
  const adapter = resolveAdapter(options?.adapter)
  if (!adapter) return null

  const baseSnapshot = toSnapshot(dataSetOrSnapshot)
  const scope = buildHistoryScope({
    dataSetName: options?.dataSetName ?? baseSnapshot.dataSetName,
    ...(options?.pageId !== undefined
      ? { pageId: options.pageId }
      : baseSnapshot.pageId !== undefined
        ? { pageId: baseSnapshot.pageId }
        : {}),
    ...(options?.scopeId !== undefined ? { scopeId: options.scopeId } : {}),
    ...(options?.namespace !== undefined ? { namespace: options.namespace } : {}),
  })
  const key = resolveDataSetHistoryKey(scope)
  const current = readEnvelope(key, adapter)
  const capacity = normalizeHistoryCapacity(options?.maxEntries, current.capacity)
  const workingEnvelope = capacity === current.capacity
    ? current
    : resizeEnvelope(current, capacity)
  const latestVersion = getLatestVersion(current.entries)
  const resolvedVersion = options?.version ?? Math.max(baseSnapshot.version ?? 0, latestVersion) + 1
  const resolvedTimestamp = options?.timestamp ?? Date.now()
  const snapshot: DataSetMetadata = {
    ...baseSnapshot,
    version: resolvedVersion,
    ...(scope.pageId !== undefined ? { pageId: scope.pageId } : {}),
  }

  const entry: DataSetHistorySnapshot = {
    id: `${resolvedVersion}-${resolvedTimestamp}`,
    version: resolvedVersion,
    timestamp: resolvedTimestamp,
    dataSetName: snapshot.dataSetName,
    ...(scope.pageId !== undefined ? { pageId: scope.pageId } : {}),
    ...(options?.label ? { label: options.label } : {}),
    ...(options?.summary ? { summary: options.summary } : {}),
    snapshot,
    ...(options?.sourceData ? { sourceData: deepClone(options.sourceData) } : {}),
  }

  writeEnvelope(key, adapter, appendEntryToEnvelope(workingEnvelope, entry))
  return entry
}

export function clearDataSetSnapshots(
  scope: DataSetHistoryScope,
  options?: DataSetHistoryListOptions,
): void {
  const adapter = resolveAdapter(options?.adapter)
  if (!adapter) return

  const key = resolveDataSetHistoryKey(buildHistoryScope({
    ...(scope.dataSetName !== undefined ? { dataSetName: scope.dataSetName } : {}),
    ...(scope.pageId !== undefined ? { pageId: scope.pageId } : {}),
    ...(scope.scopeId !== undefined ? { scopeId: scope.scopeId } : {}),
    ...(options?.namespace !== undefined
      ? { namespace: options.namespace }
      : scope.namespace !== undefined
        ? { namespace: scope.namespace }
        : {}),
  }))
  adapter.removeItem(key)
}

export function formatPageDataSnapshot(
  entry: DataSetHistorySnapshot,
  indentation = 2,
): string {
  return JSON.stringify(entry.snapshot, null, indentation)
}
