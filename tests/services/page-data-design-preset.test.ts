import { describe, expect, it } from 'vitest'
import { PAGE_DESIGN_MODULE_ID } from '@/services/page-design/page-design-agent-workflow-binding'
import {
  PAGE_DATA_DESIGN_ALLOWED_OPERATIONS,
  PAGE_DATA_DESIGN_MODULE_ID,
  normalizePageDataDesignToPageDesignInput,
} from '@/services/page-data-design/page-data-design-agent-run-provider'

describe('normalizePageDataDesignToPageDesignInput', () => {
  it('maps pageDataDesign args to pageDesign input with dataSet-only preset', () => {
    const normalized = normalizePageDataDesignToPageDesignInput({
      pageId: 'orders',
      description: '补 CRUD 表',
      effectiveDescription: '订单列表需要主从表',
      dataRequirement: '主表 orders + 明细 items',
    })

    expect(normalized['pageId']).toBe('orders')
    expect(normalized['allowedOperations']).toEqual(PAGE_DATA_DESIGN_ALLOWED_OPERATIONS)
    expect(String(normalized['description'])).toContain('补 CRUD 表')
    expect(String(normalized['description'])).toContain('主表 orders + 明细 items')
  })

  it('keeps alias constants distinct for routing vs runtime module', () => {
    expect(PAGE_DATA_DESIGN_MODULE_ID).toBe('pageDataDesign')
    expect(PAGE_DESIGN_MODULE_ID).toBe('pageDesign')
  })
})
