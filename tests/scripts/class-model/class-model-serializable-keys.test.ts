import {resolve} from 'node:path'
import ts from 'typescript'
import {describe, expect, it} from 'vitest'
import {ClassModelDeclarationSchema} from '../../../packages/spark-ai/src/class-model/class-model/schema/class-model-declaration-schema'
import {createInMemoryDeclarationCompilerHost} from '../../../scripts/lib/class-model/declaration-host'

const declarations = [
  'declare const brand: unique symbol;',
  'declare const token: "computed";',
  'declare const numberKey: 74;',
  'export type Data = { [brand]: string; [Symbol.iterator](): Iterator<string>; "__@brand@1": 1; [token]?: string; [numberKey]: number; [12]?: number; stable: string };',
  'export type Mapped = { [K in typeof brand | "stable" | 12 as K]?: number };',
  'export type Visible = { [K in typeof brand as "visible"]: string };',
  'export type Invisible = { [K in "visible" as typeof brand]: string };',
  'export type Dictionary = { [brand]: boolean; [key: string]: number };',
  'export type Picked = Pick<Data, typeof brand | "__@brand@1" | 74 | "computed">;',
].join('\n')

function project(noiseFirst: boolean) {
  const root = process.cwd()
  const emit = resolve(root, 'class-model-emit')
  const input = resolve(emit, 'src/serializable.d.ts')
  const noise = resolve(emit, 'src/unrelated.d.ts')
  const files = new Map([
    [input, declarations],
    [noise, 'declare const other: unique symbol; export type Unrelated = { [other]: number };'],
  ])
  const host = createInMemoryDeclarationCompilerHost({files, sourceOptions: {rootDir: root, baseUrl: root, outDir: emit}})
  const program = ClassModelDeclarationSchema.createProgram(noiseFirst ? [noise, input] : [input, noise], host)
  const projector = new ClassModelDeclarationSchema(program)
  const source = program.getSourceFile(input)
  if (source === undefined) throw new Error('Missing property projection fixture')
  const models = source.statements.filter(ts.isTypeAliasDeclaration).map(node => {
    const schema = projector.project(node)
    if (typeof schema === 'boolean') throw new Error(`Expected an object schema for ${node.name.text}`)
    return [node.name.text, schema] as const
  })
  return Object.fromEntries(models)
}

describe('JSON Schema string-addressable properties', () => {
  it('keeps real strings, computed string and numeric keys and optionality across root order', () => {
    const first = project(false)
    expect(project(true)).toEqual(first)
    expect(first['Data']?.properties).toEqual({
      '__@brand@1': {type: 'number', enum: [1]}, computed: {type: 'string'}, 74: {type: 'number'},
      12: {type: 'number'}, stable: {type: 'string'},
    })
    expect([...(first['Data']?.required ?? [])].sort()).toEqual(['74', '__@brand@1', 'stable'])
    expect(first['Picked']?.properties).toEqual({
      '__@brand@1': {type: 'number', enum: [1]}, computed: {type: 'string'}, 74: {type: 'number'},
    })
    expect([...(first['Picked']?.required ?? [])].sort()).toEqual(['74', '__@brand@1'])
  })

  it('uses the emitted key of a mapped property and retains the string index contract', () => {
    const schemas = project(false)
    expect(schemas['Mapped']).toEqual({
      type: 'object', properties: {stable: {type: 'number'}, 12: {type: 'number'}}, additionalProperties: false,
    })
    expect(schemas['Visible']).toEqual({
      type: 'object', properties: {visible: {type: 'string'}}, required: ['visible'], additionalProperties: false,
    })
    expect(schemas['Invisible']).toEqual({type: 'object', properties: {}, additionalProperties: false})
    expect(schemas['Dictionary']).toEqual({type: 'object', properties: {}, additionalProperties: {type: 'number'}})
  })
})

describe('declared object key order', () => {
  const source = [
    'type SourceOrder = "getDataSet" | "resolveView";',
    'type ReverseOrder = "resolveView" | "getDataSet";',
    'declare const opaque: unique symbol;',
    'type MixedSource = typeof opaque | "getDataSet" | "resolveView";',
    'type MixedReverse = typeof opaque | "resolveView" | "getDataSet";',
    'type Runtime = { [opaque]: boolean; getDataSet: (id: string) => string; resolveView: (id: string) => string; };',
    'export type Context = { ready: boolean } & Pick<Runtime, "getDataSet" | "resolveView"> & { end: string };',
    'export type ReverseContext = { ready: boolean } & Pick<Runtime, "resolveView" | "getDataSet"> & { end: string };',
    'export type Direct = Pick<Runtime, "getDataSet" | "resolveView">;',
    'export type Mapped = { [K in "getDataSet" | "resolveView"]?: boolean };',
    'export type RecordKeys = Record<"getDataSet" | "resolveView", boolean>;',
    'export type SymbolPicked = Pick<Runtime, typeof opaque | "getDataSet" | "resolveView">;',
  ].join('\n')

  function projectInFreshProgram(seedName: string, targetName: string) {
    const root = process.cwd()
    const emit = resolve(root, 'class-model-emit')
    const input = resolve(emit, 'src/object-order.d.ts')
    const host = createInMemoryDeclarationCompilerHost({
      files: new Map([[input, source]]),
      sourceOptions: {rootDir: root, baseUrl: root, outDir: emit},
    })
    const program = ClassModelDeclarationSchema.createProgram([input], host)
    const aliases = program.getSourceFile(input)?.statements.filter(ts.isTypeAliasDeclaration)
    const seed = aliases?.find(node => node.name.text === seedName)
    const target = aliases?.find(node => node.name.text === targetName)
    if (seed === undefined || target === undefined) throw new Error('Missing object projection fixture')
    program.getTypeChecker().getTypeFromTypeNode(seed.type)
    const schema = new ClassModelDeclarationSchema(program).project(target)
    if (typeof schema !== 'object' || schema.properties === undefined) throw new Error('Missing projected properties')
    return {keys: Object.keys(schema.properties), required: schema.required, json: JSON.stringify(schema)}
  }

  it.each([
    {name: 'Context', keys: ['ready', 'getDataSet', 'resolveView', 'end']},
    {name: 'ReverseContext', keys: ['ready', 'resolveView', 'getDataSet', 'end']},
    {name: 'Direct', keys: ['getDataSet', 'resolveView']},
    {name: 'Mapped', keys: ['getDataSet', 'resolveView'], optional: true},
    {name: 'RecordKeys', keys: ['getDataSet', 'resolveView']},
    {name: 'SymbolPicked', keys: ['getDataSet', 'resolveView'], mixed: true},
  ])('projects $name in declared order with either checker key order', ({name, keys, optional, mixed}) => {
    const first = projectInFreshProgram(mixed === true ? 'MixedSource' : 'SourceOrder', name)
    const second = projectInFreshProgram(mixed === true ? 'MixedReverse' : 'ReverseOrder', name)
    expect(first.json).toBe(second.json)
    expect(first.keys).toEqual(keys)
    expect(first.required).toEqual(optional === true ? undefined : keys)
  })
})
