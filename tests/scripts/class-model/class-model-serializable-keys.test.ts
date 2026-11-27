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
