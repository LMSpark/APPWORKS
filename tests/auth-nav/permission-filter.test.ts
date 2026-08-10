import { describe, expect, it } from 'vitest'
import type { DataRow } from '@spark-appworks/spark-data'
import { permission } from '../../packages/spark-component/src/index'

const { filterDisplayableFields } = permission

describe('PermissionFilter', () => {
  it('keeps backend-returned masked fields and removes hidden fields', () => {
    const row: DataRow = {
      id: 1,
      phone: '13800138000',
      secret: 'top-secret',
      lingma_sys_params: { r: [], e: [], m: ['phone'], h: ['secret'], d: false },
    }

    const filtered = filterDisplayableFields(row)

    expect(filtered['phone']).toBe('13800138000')
    expect(filtered).not.toHaveProperty('secret')
  })
})
