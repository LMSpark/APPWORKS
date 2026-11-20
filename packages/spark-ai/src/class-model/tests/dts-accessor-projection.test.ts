import {describe, expect, it} from 'vitest'
import ts from 'typescript'
import {resolve} from 'node:path'
import {projectDtsSourceFileProjection} from '../class-model/declaration/project-from-declarations'
import {ClassModelDeclarationSchema} from '../class-model/schema/class-model-declaration-schema'

describe('class accessor contracts', () => {
  it('merges public get/set as one attribute with actual readability, writability and schema', () => {
    const absolutePath = resolve('class-model-emit/accessors.d.ts')
    const sourceFile = ts.createSourceFile(absolutePath, `export class View {
      /** Persistent configuration. */
      get queryConfig(): { allPages?: boolean };
      set queryConfig(value: { allPages?: boolean });
      /** Applied filter. */ get filterExpression(): string | undefined;
      /** Setter only. */ set input(value: number);
      private get hidden(): string;
      private set hidden(value: string);
    }`, ts.ScriptTarget.Latest, true)
    const declarationSchema = new ClassModelDeclarationSchema(ClassModelDeclarationSchema.createProgram([]))
    const model = projectDtsSourceFileProjection({repoRoot: process.cwd(), absolutePath, sourceFile, declarationSchema}).models['View']
    if (model?.declarationKind !== 'class') throw new Error('missing class')
    const attributes = model.classDecl.members.attributes
    expect(attributes.map(item => item.name)).toEqual(['queryConfig', 'filterExpression', 'input'])
    expect(attributes[0]).toMatchObject({readable: true, writable: true, schema: {type: 'object', properties: {allPages: {type: 'boolean'}}}})
    expect(attributes[0]?.jsdoc).toContain('Persistent configuration')
    expect(attributes[1]).toMatchObject({readable: true, writable: false})
    expect(attributes[2]).toMatchObject({readable: false, writable: true, schema: {type: 'number'}})
  })
})
