import { describe, expect, it } from 'vitest'

import {
  encodeLowcodeBlueprintFileVersions,
  lowcodeBlueprintVersionedFileName,
  parseLowcodeBlueprintFileVersions,
} from './project-blueprint-file-version.js'

describe('project blueprint file version', () => {
  it('reads bare files when versionId is empty', () => {
    const versions = parseLowcodeBlueprintFileVersions('')
    expect(versions).toEqual({ rule: null, script: null, style: null })
    expect(lowcodeBlueprintVersionedFileName('rule.json', versions)).toBe('rule.json')
  })

  it('maps a historical scalar version to all three files', () => {
    const versions = parseLowcodeBlueprintFileVersions('2')
    expect(versions).toEqual({ rule: 2, script: 2, style: 2 })
    expect(lowcodeBlueprintVersionedFileName('script.js', versions)).toBe('2__script.js')
  })

  it('parses named segments independent of input order and encodes fixed order', () => {
    const versions = parseLowcodeBlueprintFileVersions('style=3;rule=2;script=1')
    expect(versions).toEqual({ rule: 2, script: 1, style: 3 })
    expect(encodeLowcodeBlueprintFileVersions(versions)).toBe('rule=2;script=1;style=3')
  })

  it.each([
    'rule=1;rule=2',
    'data=1',
    'rule=-1',
    'rule=',
    'rule=1;;style=2',
  ])('rejects invalid versionId %s', (value) => {
    expect(() => parseLowcodeBlueprintFileVersions(value)).toThrow()
  })
})
