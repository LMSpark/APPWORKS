import { describe, expect, it } from 'vitest'
import type { PermissionRuntimeSnapshot } from '@spark-appworks/spark-lowcode-api'

import {
  authorizedFeatureTagsFromPermissionRuntime,
  resolveAllowAddFromPermissionRuntime,
  toDataPermissionSnapshotInput,
} from '../../src/lowcode/permission/lowcode-permission-to-data-permission'

function permission(
  patch: Partial<PermissionRuntimeSnapshot> = {},
): PermissionRuntimeSnapshot {
  return {
    formKey: 'FORM-1',
    authorizedFeatureTags: ['employee.read'],
    allowAddByResource: {},
    ...patch,
  }
}

describe('lowcode-permission-to-data-permission', () => {
  it('投影功能标签', () => {
    expect(authorizedFeatureTagsFromPermissionRuntime(permission({
      authorizedFeatureTags: ['a', 'b'],
    }))).toEqual(['a', 'b'])
  })

  it('资源表硬拒绝优先于查询 allowAdd', () => {
    expect(resolveAllowAddFromPermissionRuntime(
      permission({ allowAddByResource: { 'RES-1': false } }),
      'RES-1',
      true,
    )).toBe(false)
  })

  it('资源表未拒绝时采用查询 allowAdd', () => {
    expect(resolveAllowAddFromPermissionRuntime(
      permission({ allowAddByResource: { 'RES-1': true } }),
      'RES-1',
      false,
    )).toBe(false)
    expect(resolveAllowAddFromPermissionRuntime(
      permission(),
      'RES-1',
      true,
    )).toBe(true)
  })

  it('组装 DataPermissionSnapshotInput 并校验 formKey', () => {
    const snapshot = toDataPermissionSnapshotInput(permission(), {
      formKey: 'FORM-1',
      dataSpaceId: 'DS-1',
      modelId: 'MODEL-1',
      resourceId: 'RES-1',
      rows: [{ id: 1 }],
      originalRows: [{ id: 1 }],
      total: 1,
      systemKey: 'SYS',
      queryAllowAdd: true,
    })
    expect(snapshot.allowAdd).toBe(true)
    expect(snapshot.authorizedFeatureTags).toEqual(['employee.read'])
    expect(snapshot.formKey).toBe('FORM-1')

    expect(() => toDataPermissionSnapshotInput(permission(), {
      formKey: 'OTHER',
      dataSpaceId: 'DS-1',
      modelId: 'MODEL-1',
      resourceId: 'RES-1',
      rows: [],
      originalRows: [],
      total: 0,
      systemKey: 'SYS',
      queryAllowAdd: true,
    })).toThrow(/formKey/)
  })
})
