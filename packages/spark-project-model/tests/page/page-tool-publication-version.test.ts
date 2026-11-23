import { describe, expect, it } from 'vitest'

import {
  encodePageToolPublicationVersions,
  pageToolPublicationVersionedFileName,
  parsePageToolPublicationVersions,
} from '@spark-appworks/spark-project-model'

describe('project blueprint file version', () => {
  it('reads bare files when versionId is empty', () => {
    const versions = parsePageToolPublicationVersions('')
    expect(versions).toEqual({ rule: null, script: null, style: null, manifest: null })
    expect(pageToolPublicationVersionedFileName('rule.json', versions)).toBe('rule.json')
  })

  it('maps a historical scalar version to all three files', () => {
    const versions = parsePageToolPublicationVersions('2')
    expect(versions).toEqual({ rule: 2, script: 2, style: 2, manifest: null })
    expect(pageToolPublicationVersionedFileName('script.js', versions)).toBe('2__script.js')
  })

  it('parses named segments independent of input order and encodes fixed order', () => {
    const versions = parsePageToolPublicationVersions('style=3;rule=2;script=1')
    expect(versions).toEqual({ rule: 2, script: 1, style: 3, manifest: null })
    expect(encodePageToolPublicationVersions(versions)).toBe('r=2;s=1;t=3')
  })

  it('keeps legacy versionIds valid while adding a fourth manifest reference', () => {
    const versions = parsePageToolPublicationVersions('manifest=9;style=3;rule=2;script=1')
    expect(versions).toEqual({ rule: 2, script: 1, style: 3, manifest: 9 })
    expect(encodePageToolPublicationVersions(versions)).toBe('r=2;s=1;t=3;m=9')
    expect(pageToolPublicationVersionedFileName('publication-manifest.json', versions))
      .toBe('9__publication-manifest.json')
  })

  it('reads compact publication pointers', () => {
    expect(parsePageToolPublicationVersions('m=9;t=3;r=2;s=1'))
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
    expect(() => parsePageToolPublicationVersions(value)).toThrow()
  })
})
