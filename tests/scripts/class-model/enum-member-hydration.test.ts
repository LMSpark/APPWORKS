import {expect, it} from 'vitest'
import {readDtsFileProjectionDocument} from '../../../packages/spark-ai/src/class-model/class-model/bundle/read-dts-class-model-bundle-json'

function load(values: readonly (string | number | boolean | null)[], explicitFirst = false) {
  const members = ['First', 'Second', 'Third'].map((name, index) => ({
    name, readable: true, writable: false, ...(index === 0 && explicitFirst ? {schema: true} : {}),
  }))
  const projection = readDtsFileProjectionDocument({
    $schema: 'https://json-schema.org/draft/2020-12/schema', schemaVersion: 3,
    module: {name: 'app:flags', packageName: 'app', modulePath: 'flags', sourcePath: 'src/flags.ts', sourceFile: 'src/flags.ts', symbols: ['Flags'], jsdoc: '', jsdocSource: 'inferred'},
    $defs: {Flags: {$schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Flags', enum: values}},
    models: {Flags: {name: 'Flags', jsdoc: '', declarationKind: 'enum', enumDecl: {members}}},
  })
  const model = projection.models['Flags']
  if (model?.declarationKind !== 'enum') throw new Error('Expected Flags enum')
  return model.enumDecl.members.map(member => member.schema)
}

it('hydrates each persisted enum member by its declared position including null and false', () => {
  expect(load(['last', null, false])).toEqual([{const: 'last'}, {const: null}, {const: false}])
})

it('preserves an explicit member schema and skips positional inference when values are missing', () => {
  expect(load(['last', null, false], true)).toEqual([true, {const: null}, {const: false}])
  expect(load(['last', 'first'])).toEqual([undefined, undefined, undefined])
})
