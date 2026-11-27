import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import ts from 'typescript'
import {expect, it} from 'vitest'
import {DataMember} from '@spark-appworks/spark-data'
import {ClassModelDeclarationSchema} from '../../../packages/spark-ai/src/class-model/class-model/schema/class-model-declaration-schema'
import {createInMemoryDeclarationCompilerHost} from '../../../scripts/lib/class-model/declaration-host'

const root = process.cwd()
const emit = resolve(root, 'class-model-emit')
const radio = 'packages/spark-component/src/components/fields/data-components/choice/FieldRadio/FieldRadio.props.ts'
const barrel = 'packages/spark-data/src/index.ts'
const member = 'packages/spark-data/src/core/data-view-key.ts'
const shared = 'packages/spark-component/src/components/shared-types.ts'

function productionDeclaration(file: string): string {
  const source = readFileSync(resolve(root, file), 'utf8')
  return ts.transpileDeclaration(source, {fileName: file, compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText
}

function project(noiseFirst: boolean) {
  const radioPath = resolve(emit, radio.replace(/\.ts$/u, '.d.ts'))
  const extra = resolve(emit, 'src/enum-fields.d.ts')
  const warm = resolve(emit, 'src/enum-order-warm.d.ts')
  const files = new Map([radio, barrel, member, shared].map(file =>
    [resolve(emit, file.replace(/\.ts$/u, '.d.ts')), productionDeclaration(file)] as const))
  const reversed = [...Object.values(DataMember)].reverse().map(value => JSON.stringify(value))
  files.set(warm, `export type Warm = ${reversed.join(' | ')} | "alpha" | "zeta";`)
  files.set(extra, 'export type Fields = { literal?: "zeta" | "alpha"; mixed: "3" | null | 3 | false; broad: "alpha" | number | "zeta" };')
  const host = createInMemoryDeclarationCompilerHost({
    files, sourceOptions: {rootDir: root, baseUrl: root, outDir: emit, paths: {'@spark-appworks/spark-data': [barrel]}},
  })
  const roots = noiseFirst ? [warm, radioPath, extra] : [radioPath, extra, warm]
  const program = ClassModelDeclarationSchema.createProgram(roots, host)
  const projector = new ClassModelDeclarationSchema(program)
  function properties(file: string, name: string) {
    const node = program.getSourceFile(file)?.statements.filter(ts.isTypeAliasDeclaration).find(alias => alias.name.text === name)
    if (node === undefined) throw new Error(`Missing type alias ${name}`)
    const schema = projector.project(node)
    if (typeof schema === 'boolean' || schema.properties === undefined) throw new Error(`Missing object schema for ${name}`)
    return schema.properties
  }
  return {radio: properties(radioPath, 'RRadioProps'), fields: properties(extra, 'Fields')}
}

it.each([false, true])('preserves declared literal and DataMember order with the unrelated root first = %s', noiseFirst => {
  const {radio: props, fields} = project(noiseFirst)
  expect(props['dataMember']).toEqual({enum: Object.values(DataMember)})
  expect(fields['literal']).toEqual({enum: ['zeta', 'alpha']})
  expect(fields['mixed']).toEqual({anyOf: [
    {type: 'string', enum: ['3']}, {type: 'null'}, {type: 'number', enum: [3]}, {type: 'boolean', enum: [false]},
  ]})
  expect(fields['broad']).toEqual({anyOf: expect.arrayContaining([
    {type: 'string', enum: ['alpha']}, {type: 'number'}, {type: 'string', enum: ['zeta']},
  ])})
})
