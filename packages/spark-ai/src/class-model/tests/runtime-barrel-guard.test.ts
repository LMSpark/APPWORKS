import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const RUNTIME_BARREL = resolve(import.meta.dirname, '../class-model/index.ts')
const PUBLIC_BARREL = resolve(import.meta.dirname, '../index.ts')

const FORBIDDEN_RUNTIME_EXPORT_SOURCES = [
  './dts-ast-utils',
  './build-dts-class-model-bundle',
  './project-from-declarations',
  './dts-type-schema',
  './dts-jsdoc-reader',
]

describe('class-model runtime barrel', () => {
  it('does not re-export build-only modules', () => {
    for (const barrelPath of [RUNTIME_BARREL, PUBLIC_BARREL]) {
      const source = readFileSync(barrelPath, 'utf8')
      for (const modulePath of FORBIDDEN_RUNTIME_EXPORT_SOURCES) {
        expect(source, `${barrelPath} must not export from ${modulePath}`).not.toMatch(
          new RegExp(`from ['"]${modulePath.replace('.', '\\.')}['"]`),
        )
      }
      expect(source, `${barrelPath} must not re-export ./class-model barrel`).not.toMatch(
        /from ['"]\.\/class-model['"]/,
      )
    }
  })
})
