import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {buildDtsClassModelBundle} from '../../../packages/spark-ai/src/class-model/class-model/bundle/build-dts-class-model-bundle'
import {createInMemoryDeclarationCompilerHost} from '../../../scripts/lib/class-model/declaration-host'

const entry = 'src/entry.ts'
const provider = 'packages/domain/provider.ts'
const barrel = 'packages/domain/index.ts'
const external = 'src/foreign.ts'
const emitName = (file: string) => file.replace(/\.ts$/u, '.d.ts')

describe('schema model links follow the declaration visible at the type use', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'class-model-reference-')) })
  afterEach(() => { rmSync(root, {recursive: true, force: true}) })

  function project(sources: ReadonlyMap<string, string>): unknown {
    const emit = join(root, 'class-model-emit')
    const outputDir = join(root, 'bundle')
    const files = new Map([...sources].map(([file, source]) => [join(emit, emitName(file)), source]))
    const host = createInMemoryDeclarationCompilerHost({
      files, sourceOptions: {rootDir: root, baseUrl: root, outDir: emit, paths: {'@domain/api': [barrel]}},
    })
    const result = buildDtsClassModelBundle({repoRoot: root, rootFiles: [...files.keys()], outputDir, compilerHost: host})
    const shard = result.manifest.files[entry]
    if (shard === undefined) throw new Error(`Missing source shard for ${entry}`)
    return JSON.parse(readFileSync(join(outputDir, shard.file), 'utf8'))
  }

  it('preserves the builtin Record and DOM File when an unrelated module declares both names', () => {
    const shard = project(new Map([
      [external, 'type File = { fileHash: string }; type Record = { scope: string }; type ForeignObject = object; export declare const install: string;'],
      [entry, 'export declare class Api { get(): Record<string, unknown>; upload(file: File): void }; export type Options = { style: object };'],
    ]))
    expect(shard).toHaveProperty(['$defs', 'Api', '$defs', 'method.get.return'], {type: 'object', title: 'Record<string, unknown>'})
    expect(shard).toHaveProperty(['$defs', 'Api', '$defs', 'method.upload.params', 'properties', 'file'], {type: 'object', title: 'File'})
    expect(shard).toHaveProperty(['$defs', 'Options', 'properties', 'style'], true)
  })

  it('resolves imported aliases and namespace members through the package barrel and respects a method type parameter', () => {
    const shard = project(new Map([
      [provider, 'export type Record = { owned: string }; export type File = { ownedFile: string };'],
      [barrel, 'export { Record, File } from "./provider.js";'],
      [external, 'type Record = { unrelated: number }; type File = { unrelated: number }; export declare const install: string;'],
      [entry, [
        'import type { Record as Owned, File as Uploaded } from "@domain/api";',
        'import type * as Domain from "@domain/api";',
        'export declare class Api { named(input: Owned): Uploaded; qualified(input: Domain.File): Domain.Record; generic<Owned>(input: Owned): Owned }',
      ].join('\n')],
    ]))
    const record = expect.objectContaining({$ref: '../packages/domain/provider.ts.json#/$defs/Record'})
    const file = expect.objectContaining({$ref: '../packages/domain/provider.ts.json#/$defs/File'})
    expect(shard).toHaveProperty(['$defs', 'Api', '$defs', 'method.named.params', 'properties', 'input'], record)
    expect(shard).toHaveProperty(['$defs', 'Api', '$defs', 'method.named.return'], file)
    expect(shard).toHaveProperty(['$defs', 'Api', '$defs', 'method.qualified.params', 'properties', 'input'], file)
    expect(shard).toHaveProperty(['$defs', 'Api', '$defs', 'method.qualified.return'], record)
    expect(shard).toHaveProperty(['$defs', 'Api', '$defs', 'method.generic.params', 'properties', 'input'], true)
    expect(shard).toHaveProperty(['$defs', 'Api', '$defs', 'method.generic.return'], true)
  })

  it('retains both sides of a recursive Readonly declaration through the declaring module', () => {
    const shard = project(new Map([
      [entry, [
        'export type Node = Readonly<{ attributes?: readonly Attribute[] }>;',
        'export type Attribute = Readonly<{ owner?: Node }>;',
        'export type Command = Readonly<{ original?: Node }>;',
      ].join('\n')],
    ]))
    expect(shard).toHaveProperty(['$defs', 'Command', 'properties', 'original'], {$ref: '#/$defs/Node'})
    expect(shard).toHaveProperty(['$defs', 'Node', 'properties', 'attributes', 'items'], {$ref: '#/$defs/Attribute'})
    expect(shard).toHaveProperty(['$defs', 'Attribute', 'properties', 'owner'], {$ref: '#/$defs/Node'})
  })


  it('keeps the declaration of each inherited property when two unrelated modules use the same type name', () => {
    const shard = project(new Map([
      ['packages/left/child.ts', 'export type Children = Array<string | number>;'],
      ['packages/right/child.ts', 'export type Children = { selected: boolean };'],
      ['packages/left/props.ts', 'import type {Children} from "./child"; export type Left = { children?: Children };'],
      ['packages/right/props.ts', 'import type {Children} from "./child"; export type Right = { selection?: Children };'],
      [entry, [
        'import type {Left} from "../packages/left/props";',
        'import type {Right} from "../packages/right/props";',
        'export type ComponentProps = Left & Right;',
      ].join('\n')],
    ]))
    expect(shard).toHaveProperty(['$defs', 'ComponentProps', 'properties', 'children'], {
      $ref: '../packages/left/child.ts.json#/$defs/Children',
    })
    expect(shard).toHaveProperty(['$defs', 'ComponentProps', 'properties', 'selection'], {
      $ref: '../packages/right/child.ts.json#/$defs/Children',
    })
  })

})
