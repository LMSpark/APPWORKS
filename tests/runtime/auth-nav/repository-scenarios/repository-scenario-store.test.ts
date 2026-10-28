import {mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises'
import * as fsPromises from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {RepositoryScenarioStore, RepositoryScenarioStoreError} from '../../../../tools/repository-scenario-store'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {...actual, realpath: vi.fn(actual.realpath)}
})

const resource = {scenarioId: 'SCENE-1', resourceId: 'repository:scenario-view:SCENE-1', path: 'config/pages/scene/pagedata.json'}
const beforeText = JSON.stringify({scenarioId: resource.scenarioId, revision: 'before'})
const roots: string[] = []

describe('repository scenario file store', () => {
  it('reads, compares, replaces and reads back one registered file', async () => {
    const {root, file, store} = await fixture()
    const before = await store.read(resource.resourceId)
    expect(before).toMatchObject({resourceId: resource.resourceId, scenarioId: resource.scenarioId, text: beforeText})
    expect(before.sourceRevision).toMatch(/^[a-f0-9]{64}$/u)

    const afterText = JSON.stringify({scenarioId: resource.scenarioId, revision: 'after'})
    const after = await store.write(resource.resourceId, afterText, before.text)

    expect(await readFile(file, 'utf8')).toBe(afterText)
    expect(after).toMatchObject({resourceId: resource.resourceId, scenarioId: resource.scenarioId, text: afterText})
    expect(after.sourceRevision).not.toBe(before.sourceRevision)
  })

  it('rejects a stale preimage without replacing the file', async () => {
    const {file, store} = await fixture()
    await expect(store.write(resource.resourceId, JSON.stringify({scenarioId: resource.scenarioId}), 'stale')).rejects.toMatchObject({
      response: {resourceId: resource.resourceId, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_CONFLICT'},
      status: 409,
    })
    expect(await readFile(file, 'utf8')).toBe(beforeText)
  })

  it('serializes same-resource writes so only one captured preimage can apply', async () => {
    const {file, store} = await fixture()
    const outcomes = await Promise.allSettled([
      store.write(resource.resourceId, JSON.stringify({scenarioId: resource.scenarioId, revision: 'first'}), beforeText),
      store.write(resource.resourceId, JSON.stringify({scenarioId: resource.scenarioId, revision: 'second'}), beforeText),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = outcomes.find(result => result.status === 'rejected')
    if (rejected?.status !== 'rejected') throw new Error('one serialized write should conflict')
    expect(rejected.reason).toBeInstanceOf(RepositoryScenarioStoreError)
    expect(rejected.reason.response.outcome).toBe('not-applied')
    expect(['first', 'second']).toContain(JSON.parse(await readFile(file, 'utf8')).revision)
  })

  it('queues reads behind an in-flight atomic replacement and releases the queue after replacement failure', async () => {
    const root = await newRoot(), file = path.join(root, resource.path)
    await mkdir(path.dirname(file), {recursive: true}); await writeFile(file, beforeText)
    let replacementStarted!: () => void, finishReplacement!: () => void, failReplacement = false
    const started = new Promise<void>(resolve => {replacementStarted = resolve})
    const gate = new Promise<void>(resolve => {finishReplacement = resolve})
    const store = new RepositoryScenarioStore({root, resources: [resource], beforeReplace: async () => {
      replacementStarted(); await gate
    }, replaceFile: async (temporary, target) => {
      if (failReplacement) throw new Error('rename failed')
      await rename(temporary, target)
    }})
    const nextText = JSON.stringify({scenarioId: resource.scenarioId, revision: 'after'})
    const writing = store.write(resource.resourceId, nextText, beforeText)
    let reading: Promise<Awaited<ReturnType<typeof store.read>>> | undefined
    const realpath = vi.mocked(fsPromises.realpath)
    try {
      await started
      realpath.mockClear()
      reading = store.read(resource.resourceId)
      expect(realpath).not.toHaveBeenCalled()
    } finally {
      finishReplacement()
      await Promise.allSettled([writing, ...(reading ? [reading] : [])])
      realpath.mockRestore()
    }
    if (!reading) throw new Error('queued read was not started')
    expect((await reading).text).toBe(nextText)

    failReplacement = true
    await expect(store.write(resource.resourceId, beforeText, nextText)).rejects.toMatchObject({
      response: {outcome: 'unknown', code: 'REPOSITORY_SCENARIO_WRITE_UNKNOWN'},
    })
    expect((await store.read(resource.resourceId)).text).toBe(nextText)
    expect((await readdir(path.dirname(file))).filter(name => name.endsWith('.tmp'))).toEqual([])
  })

  it('classifies pre-replace failure as not-applied and post-replace readback failure as unknown', async () => {
    const {root, file} = await fixture()
    const nextText = JSON.stringify({scenarioId: resource.scenarioId, revision: 'next'})
    const beforeFailure = new RepositoryScenarioStore({root, resources: [resource], beforeReplace: async () => {throw new Error('temp preparation failed')}})
    await expect(beforeFailure.write(resource.resourceId, nextText, beforeText)).rejects.toMatchObject({
      response: {outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_NOT_APPLIED'},
    })
    expect(await readFile(file, 'utf8')).toBe(beforeText)

    let reads = 0
    const afterFailure = new RepositoryScenarioStore({root, resources: [resource], readBytes: async filePath => {
      reads++
      if (reads === 2) throw new Error('readback unavailable')
      return readFile(filePath)
    }})
    await expect(afterFailure.write(resource.resourceId, nextText, beforeText)).rejects.toMatchObject({
      response: {outcome: 'unknown', code: 'REPOSITORY_SCENARIO_WRITE_UNKNOWN'},
    })
    expect(await readFile(file, 'utf8')).toBe(nextText)
  })

  it('preserves a UTF-8 BOM and rejects invalid UTF-8 without replacing exact text', async () => {
    const root = await newRoot(), file = path.join(root, resource.path)
    await mkdir(path.dirname(file), {recursive: true})
    const bomText = `\uFEFF${JSON.stringify({scenarioId: resource.scenarioId, revision: 'bom'})}`
    await writeFile(file, bomText, 'utf8')
    const store = new RepositoryScenarioStore({root, resources: [resource]})
    const read = await store.read(resource.resourceId)
    expect(read.text).toBe(bomText)
    expect(read.sourceRevision).toBe(createHash('sha256').update(bomText, 'utf8').digest('hex'))
    const nextText = `\uFEFF${JSON.stringify({scenarioId: resource.scenarioId, revision: 'next'})}`
    expect((await store.write(resource.resourceId, nextText, bomText)).text).toBe(nextText)
    await writeFile(file, Buffer.from([0xC3, 0x28]))
    await expect(store.read(resource.resourceId)).rejects.toMatchObject({
      response: {outcome: 'unknown', code: 'REPOSITORY_SCENARIO_READ_FAILED'},
    })
    expect(await readFile(file)).toEqual(Buffer.from([0xC3, 0x28]))
  })

  it('rejects malformed or misidentified scenario text before replacement', async () => {
    const {file, store} = await fixture()
    for (const text of ['{', JSON.stringify({scenarioId: 'OTHER'})]) {
      await expect(store.write(resource.resourceId, text, beforeText)).rejects.toMatchObject({
        response: {outcome: 'not-applied'},
      })
      expect(await readFile(file, 'utf8')).toBe(beforeText)
    }
  })

  it('rejects a symlink in the registered file path before replacement', async () => {
    const root = await newRoot()
    const configDir = path.join(root, 'config')
    const outside = await newRoot()
    await mkdir(path.join(outside, 'pages', 'scene'), {recursive: true})
    await writeFile(path.join(outside, 'pages', 'scene', 'pagedata.json'), 'outside')
    await mkdir(configDir)
    await (await import('node:fs/promises')).symlink(path.join(outside, 'pages'), path.join(configDir, 'pages'), 'junction')
    const store = new RepositoryScenarioStore({root, resources: [resource]})
    await expect(store.write(resource.resourceId, JSON.stringify({scenarioId: resource.scenarioId}), 'outside')).rejects.toMatchObject({
      response: {outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_PATH_LINK'},
    })
    expect(await readFile(path.join(outside, 'pages', 'scene', 'pagedata.json'), 'utf8')).toBe('outside')
  })

  it('lists without creating history storage, then reads and exclusively creates a separate snapshot', async () => {
    const {root, file, store} = await fixture()
    expect(await store.listVersions(resource.resourceId)).toMatchObject({versions: []})
    await expect(readdir(path.join(root, 'config', 'history', 'scenarios'))).rejects.toMatchObject({code: 'ENOENT'})
    const created = await createVersion(store, 0, beforeText, beforeText)
    expect(created).toMatchObject({version: 0, fileName: '0__pagedata.json', text: beforeText})
    expect(await store.listVersions(resource.resourceId)).toMatchObject({versions: [{version: 0, fileName: '0__pagedata.json'}]})
    expect(await store.readVersion(resource.resourceId, 0)).toMatchObject({text: beforeText, version: 0})
    expect(await readFile(file, 'utf8')).toBe(beforeText)
  })

  it('does not overwrite or reallocate a colliding snapshot number', async () => {
    const {root, store} = await fixture()
    await createVersion(store, 4, beforeText, beforeText)
    await expect(createVersion(store, 4, beforeText, beforeText)).rejects.toMatchObject({
      response: {resourceId: resource.resourceId, version: 4, outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_VERSION_CONFLICT'}, status: 409,
    })
    expect((await store.readVersion(resource.resourceId, 4)).text).toBe(beforeText)
    expect(await readdir(path.join(root, 'config', 'history', 'scenarios', resource.scenarioId))).toEqual(['4__pagedata.json'])
  })

  it('serializes concurrent creates for the same N and shares the queue with active file saves', async () => {
    const {root, file, store} = await fixture()
    const same = await Promise.allSettled([
      createVersion(store, 2, beforeText, beforeText),
      createVersion(store, 2, beforeText, beforeText),
    ])
    expect(same.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(same.filter(result => result.status === 'rejected')).toHaveLength(1)

    const nextText = JSON.stringify({scenarioId: resource.scenarioId, revision: 'saved'})
    let release!: () => void
    const gate = new Promise<void>(resolve => {release = resolve})
    let started!: () => void
    const didStart = new Promise<void>(resolve => {started = resolve})
    const saving = new RepositoryScenarioStore({root, resources: [resource], beforeReplace: async () => {started(); await gate}})
    const writing = saving.write(resource.resourceId, nextText, beforeText)
    await didStart
    const snapshot = createVersion(saving, 3, beforeText, beforeText)
    expect(await readdir(path.join(root, 'config', 'history', 'scenarios', resource.scenarioId))).toEqual(['2__pagedata.json'])
    release()
    await writing
    await expect(snapshot).rejects.toMatchObject({response: {outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_CONFLICT', version: 3}})
    expect(await readFile(file, 'utf8')).toBe(nextText)
    expect(await readdir(path.join(root, 'config', 'history', 'scenarios', resource.scenarioId))).toEqual(['2__pagedata.json'])
  })

  it('rejects history directory junctions and refuses snapshots that differ from the active baseline', async () => {
    const {root, store} = await fixture()
    const other = await newRoot(), historyRoot = path.join(root, 'config', 'history', 'scenarios')
    await mkdir(historyRoot, {recursive: true})
    await (await import('node:fs/promises')).symlink(other, path.join(historyRoot, resource.scenarioId), 'junction')
    await expect(createVersion(store, 1, beforeText, beforeText)).rejects.toMatchObject({
      response: {outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_PATH_LINK', version: 1},
    })

    const clean = await fixture()
    const changed = JSON.stringify({scenarioId: resource.scenarioId, revision: 'not-active'})
    await expect(createVersion(clean.store, 1, changed, beforeText)).rejects.toMatchObject({
      response: {outcome: 'not-applied', code: 'REPOSITORY_SCENARIO_VERSION_BASELINE_MISMATCH', version: 1},
    })
    await expect(readdir(path.join(clean.root, 'config', 'history', 'scenarios', resource.scenarioId))).rejects.toMatchObject({code: 'ENOENT'})
  })
})

afterEach(async () => {for (const root of roots.splice(0)) await rm(root, {recursive: true, force: true})})

function createVersion(store: RepositoryScenarioStore, version: number, text: string, expectedText: string) {
  return store.createVersion({resourceId: resource.resourceId, version, text, expectedText})
}

async function fixture(): Promise<{root: string; file: string; store: RepositoryScenarioStore}> {
  const root = await newRoot()
  const file = path.join(root, resource.path)
  await mkdir(path.dirname(file), {recursive: true})
  await writeFile(file, beforeText)
  return {root, file, store: new RepositoryScenarioStore({root, resources: [resource]})}
}

async function newRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'spark-repository-scenario-'))
  roots.push(root)
  return root
}
