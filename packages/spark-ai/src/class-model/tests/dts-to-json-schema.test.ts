import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { auditDraft2020Schema, type StandardJsonSchemaObject } from '@spark-appworks/spark-json-document'

import { projectDtsRootFilesToJsonSchemas } from '../class-model/schema/class-model-to-json-schema'

const TMP_DIR = resolve(__dirname, '__tmp_dts_to_schema__')

function setup(): string {
  mkdirSync(TMP_DIR, { recursive: true })
  return TMP_DIR
}

function teardown(): void {
  rmSync(TMP_DIR, { recursive: true, force: true })
}

function writeDts(name: string, content: string): string {
  const path = resolve(TMP_DIR, name)
  writeFileSync(path, content, 'utf8')
  return path
}

function findSchema(
  results: ReturnType<typeof projectDtsRootFilesToJsonSchemas>,
  name: string,
): StandardJsonSchemaObject | undefined {
  for (const result of results) {
    const schema = result.schemas[name]
    if (schema !== undefined) return schema
  }
  return undefined
}

describe('projectDtsRootFilesToJsonSchemas', () => {
  afterAll(() => {
    teardown()
  })

  it('maps a class with required and optional properties', () => {
    setup()
    const filePath = writeDts('demo.d.ts', `
      export declare class Demo {
        id: string
        name?: string
        readonly label: string
      }
    `)

    const results = projectDtsRootFilesToJsonSchemas({ repoRoot: TMP_DIR, rootFiles: [filePath] })
    expect(results.length).toBe(1)

    const schema = findSchema(results, 'Demo')
    expect(schema).toBeDefined()
    expect(schema!['$schema']).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema!.type).toBe('object')
    expect(schema!.title).toBe('Demo')
    expect(schema!.properties).toBeDefined()
    expect(schema!.properties!['id']).toEqual({ type: 'string' })
    expect(schema!.properties!['name']).toEqual({ type: 'string' })
    expect(schema!.properties!['label']).toEqual({ type: 'string' })
    expect(schema!.required).toEqual(['id'])
    expect(schema!.additionalProperties).toBe(false)
    expect(auditDraft2020Schema(schema!)).toEqual([])
  })

  it('maps an interface with properties', () => {
    setup()
    const filePath = writeDts('iface.d.ts', `
      export interface Config {
        host: string
        port: number
        secure?: boolean
      }
    `)

    const results = projectDtsRootFilesToJsonSchemas({ repoRoot: TMP_DIR, rootFiles: [filePath] })
    const schema = findSchema(results, 'Config')
    expect(schema).toBeDefined()

    expect(schema!.type).toBe('object')
    expect(schema!.required).toEqual(['host', 'port'])
    expect(schema!.properties!['port']).toEqual({ type: 'number' })
    expect(schema!.properties!['secure']).toEqual({ type: 'boolean' })
    expect(auditDraft2020Schema(schema!)).toEqual([])
  })

  it('maps a type alias with string literal union', () => {
    setup()
    const filePath = writeDts('enum.d.ts', `
      export declare type Status = 'active' | 'inactive' | 'pending'
    `)

    const results = projectDtsRootFilesToJsonSchemas({ repoRoot: TMP_DIR, rootFiles: [filePath] })
    const schema = findSchema(results, 'Status')
    expect(schema).toBeDefined()

    expect(schema!.title).toBe('Status')
    expect(schema!.enum).toEqual(['active', 'inactive', 'pending'])
    expect(auditDraft2020Schema(schema!)).toEqual([])
  })

  it('maps Readonly object property string literal union to a single enum', () => {
    setup()
    const filePath = writeDts('diag.d.ts', `
      export declare type Diagnostic = Readonly<{
        level: 'error' | 'warn' | 'info'
        code: string
      }>
    `)

    const results = projectDtsRootFilesToJsonSchemas({ repoRoot: TMP_DIR, rootFiles: [filePath] })
    const schema = findSchema(results, 'Diagnostic')
    expect(schema).toBeDefined()
    expect(schema!.properties?.['level']).toEqual({
      enum: ['error', 'warn', 'info'],
    })
    expect(auditDraft2020Schema(schema!)).toEqual([])
  })

  it('maps a numeric enum', () => {
    setup()
    const filePath = writeDts('numenum.d.ts', `
      export declare enum Direction {
        Up = 0,
        Down = 1,
        Left = 2,
        Right = 3
      }
    `)

    const results = projectDtsRootFilesToJsonSchemas({ repoRoot: TMP_DIR, rootFiles: [filePath] })
    const schema = findSchema(results, 'Direction')
    expect(schema).toBeDefined()

    expect(schema!.title).toBe('Direction')
    expect(schema!.enum).toEqual([0, 1, 2, 3])
    expect(auditDraft2020Schema(schema!)).toEqual([])
  })

  it('skips non-exported declarations when exportedOnly is true', () => {
    setup()
    const filePath = writeDts('nonexported.d.ts', `
      declare class Internal {}
      export declare class Public {}
    `)

    const results = projectDtsRootFilesToJsonSchemas({ repoRoot: TMP_DIR, rootFiles: [filePath], exportedOnly: true })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.schemas['Internal']).toBeUndefined()
    expect(results[0]!.schemas['Public']).toBeDefined()
  })

  it('includes non-exported declarations when exportedOnly is false', () => {
    setup()
    const filePath = writeDts('nonexported2.d.ts', `
      declare class Internal {}
      export declare class Public {}
    `)

    const results = projectDtsRootFilesToJsonSchemas({ repoRoot: TMP_DIR, rootFiles: [filePath], exportedOnly: false })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.schemas['Internal']).toBeDefined()
    expect(results[0]!.schemas['Public']).toBeDefined()
  })

  it('every output passes auditDraft2020Schema', () => {
    setup()
    const filePath = writeDts('audit.d.ts', `
      export declare class AuditClass {
        id: string
        count: number
        active: boolean
        tags: string[]
      }
      export interface AuditIface {
        name: string
      }
      export declare enum AuditEnum {
        A = 'a',
        B = 'b'
      }
    `)

    const results = projectDtsRootFilesToJsonSchemas({ repoRoot: TMP_DIR, rootFiles: [filePath] })
    for (const result of results) {
      for (const [name, schema] of Object.entries(result.schemas)) {
        expect(
          auditDraft2020Schema(schema),
          `audit failed for ${name}`,
        ).toEqual([])
      }
    }
  })

  it('handles array properties', () => {
    setup()
    const filePath = writeDts('array.d.ts', `
      export interface WithArray {
        items: string[]
      }
    `)

    const results = projectDtsRootFilesToJsonSchemas({ repoRoot: TMP_DIR, rootFiles: [filePath] })
    const schema = findSchema(results, 'WithArray')
    expect(schema).toBeDefined()
    const itemsSchema = schema!.properties!['items']
    expect(itemsSchema).toBeDefined()
    if (typeof itemsSchema === 'object' && !Array.isArray(itemsSchema)) {
      expect(itemsSchema.type).toBe('array')
      expect(itemsSchema.items).toEqual({ type: 'string' })
    }
    expect(auditDraft2020Schema(schema!)).toEqual([])
  })

  it('handles nullable properties', () => {
    setup()
    const filePath = writeDts('nullable.d.ts', `
      export interface WithNullable {
        name: string | null
      }
    `)

    const results = projectDtsRootFilesToJsonSchemas({ repoRoot: TMP_DIR, rootFiles: [filePath] })
    const schema = findSchema(results, 'WithNullable')
    expect(schema).toBeDefined()
    const nameSchema = schema!.properties!['name']
    if (typeof nameSchema === 'object' && !Array.isArray(nameSchema)) {
      expect(nameSchema.type).toContain('null')
      expect(nameSchema.type).toContain('string')
    }
    expect(auditDraft2020Schema(schema!)).toEqual([])
  })

  it('processes multiple root files', () => {
    setup()
    const fileA = writeDts('a.d.ts', `export declare class A { x: number }`)
    const fileB = writeDts('b.d.ts', `export declare class B { y: string }`)

    const results = projectDtsRootFilesToJsonSchemas({ repoRoot: TMP_DIR, rootFiles: [fileA, fileB] })
    expect(results.length).toBe(2)
    expect(results[0]!.schemas['A']).toBeDefined()
    expect(results[1]!.schemas['B']).toBeDefined()
  })
})
