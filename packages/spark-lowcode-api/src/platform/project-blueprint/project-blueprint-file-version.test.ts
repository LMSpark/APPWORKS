import { describe, expect, it } from 'vitest'

import {
  encodeLowcodeBlueprintFileVersions,
  lowcodeBlueprintVersionedFileName,
  parseLowcodeBlueprintFileVersions,
} from './project-blueprint-file-version.js'

describe('project blueprint file version', () => {
  it('reads bare files when versionId is empty', () => {
    const versions = parseLowcodeBlueprintFileVersions('')
    expect(versions).toEqual({ rule: null, script: null, style: null, manifest: null })
    expect(lowcodeBlueprintVersionedFileName('rule.json', versions)).toBe('rule.json')
  })

  it('maps a historical scalar version to all three files', () => {
    const versions = parseLowcodeBlueprintFileVersions('2')
    expect(versions).toEqual({ rule: 2, script: 2, style: 2, manifest: null })
    expect(lowcodeBlueprintVersionedFileName('script.js', versions)).toBe('2__script.js')
  })

  it('parses named segments independent of input order and encodes fixed order', () => {
    const versions = parseLowcodeBlueprintFileVersions('style=3;rule=2;script=1')
    expect(versions).toEqual({ rule: 2, script: 1, style: 3, manifest: null })
    expect(encodeLowcodeBlueprintFileVersions(versions)).toBe('r=2;s=1;t=3')
  })

  it('keeps legacy versionIds valid while adding a fourth manifest reference', () => {
    const versions = parseLowcodeBlueprintFileVersions('manifest=9;style=3;rule=2;script=1')
    expect(versions).toEqual({ rule: 2, script: 1, style: 3, manifest: 9 })
    expect(encodeLowcodeBlueprintFileVersions(versions)).toBe('r=2;s=1;t=3;m=9')
    expect(lowcodeBlueprintVersionedFileName('publication-manifest.json', versions))
      .toBe('9__publication-manifest.json')
  })

  it('reads compact publication pointers', () => {
    expect(parseLowcodeBlueprintFileVersions('m=9;t=3;r=2;s=1'))
      .toEqual({rule:2,script:1,style:3,manifest:9})
  })

  it.each([
    'rule=1;rule=2',
    'r=1;rule=2',
    'data=1',
    'rule=-1',
    'rule=',
    'rule=1;;style=2',
    'manifest=1;manifest=2',
  ])('rejects invalid versionId %s', (value) => {
    expect(() => parseLowcodeBlueprintFileVersions(value)).toThrow()
  })
})
