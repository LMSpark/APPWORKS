import type {LowcodeFileLocator} from '@spark-appworks/spark-lowcode-api'
import type {PageRuntimeMode} from '@spark-appworks/spark-project-model'

type RuntimeFileCacheEntry = Readonly<{version:string; text:string}>
export type RuntimeFileCacheScope = Readonly<{
  mode: PageRuntimeMode
  sourceRevision: string
  publicationRef: string | null
}>

type ReadRuntimeFileOptions = Readonly<{
  owner: string | undefined
  locator: LowcodeFileLocator
  scope?: RuntimeFileCacheScope
  assertCurrent: () => void
  readVersion: () => Promise<string>
  readText: () => Promise<string>
}>

const memory = new Map<string, RuntimeFileCacheEntry>()

function isRecord(value:unknown):value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cacheKey(owner:string, locator:LowcodeFileLocator, scope:RuntimeFileCacheScope):string {
  return `spark_runtime_file_v1:${JSON.stringify([
    scope.mode, scope.sourceRevision, scope.publicationRef,
    owner, locator.appType, locator.customPath, locator.fileName, locator.isCrossEnterprise ?? false,
  ])}`
}

function parseEntry(value:string):RuntimeFileCacheEntry | undefined {
  try {
    const decoded:unknown = JSON.parse(value)
    if(!isRecord(decoded)) return undefined
    return typeof decoded['version'] === 'string' && typeof decoded['text'] === 'string'
      ? {version:decoded['version'], text:decoded['text']}
      : undefined
  } catch {
    return undefined
  }
}

function browserStorage():Storage | undefined {
  try { return globalThis.localStorage }
  catch { return undefined }
}

function readEntry(key:string):RuntimeFileCacheEntry | undefined {
  const storage=browserStorage()
  if(storage) {
    const stored=storage.getItem(key)
    if(stored !== null) {
      const entry=parseEntry(stored)
      if(entry) return entry
      storage.removeItem(key)
    }
  }
  return memory.get(key)
}

function writeEntry(key:string, entry:RuntimeFileCacheEntry):void {
  memory.set(key, entry)
  const storage=browserStorage()
  if(!storage) return
  try { storage.setItem(key, JSON.stringify(entry)) }
  catch { memory.set(key, entry) }
}

export async function readRuntimeFile(options:ReadRuntimeFileOptions):Promise<string> {
  options.assertCurrent()
  if(options.owner === undefined) return options.readText()
  const scope=options.scope ?? {mode:'design',sourceRevision:'working',publicationRef:null}
  const key=cacheKey(options.owner, options.locator,scope)
  const version=await options.readVersion()
  options.assertCurrent()
  const cached=readEntry(key)
  if(cached?.version === version) return cached.text
  const text=await options.readText()
  options.assertCurrent()
  writeEntry(key, {version, text})
  return text
}

export function invalidateRuntimeFile(owner:string | undefined, locator:LowcodeFileLocator, scope?:RuntimeFileCacheScope):void {
  if(owner === undefined) return
  const key=cacheKey(owner, locator,scope ?? {mode:'design',sourceRevision:'working',publicationRef:null})
  memory.delete(key)
  browserStorage()?.removeItem(key)
}
