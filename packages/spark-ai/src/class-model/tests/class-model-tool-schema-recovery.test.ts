import { describe, expect, it } from 'vitest'

import { buildClassModelToolSchemaRecoveryHint } from '../tools/class-model-tool-schema-recovery'
import { CLASS_MODEL_TOOL_NAMES } from '../tools/tool-names'

describe('buildClassModelToolSchemaRecoveryHint', () => {
  it('derives model_query allowed params from native tool schema', () => {
    const hint = buildClassModelToolSchemaRecoveryHint(CLASS_MODEL_TOOL_NAMES.query)
    expect(hint).toContain('kind')
    expect(hint).toContain('keyword')
    expect(hint).toContain('includeMembers')
    expect(hint).not.toMatch(/\bmember\s*\(/u)
  })

  it('derives model_class_guide required kind from native tool schema', () => {
    const hint = buildClassModelToolSchemaRecoveryHint(CLASS_MODEL_TOOL_NAMES.modelGuide)
    expect(hint).toContain('kind (required')
    expect(hint).not.toContain('modelName')
  })

  it('derives model_attribute_guide kind and attributeName from native tool schema', () => {
    const hint = buildClassModelToolSchemaRecoveryHint(CLASS_MODEL_TOOL_NAMES.attributeGuide)
    expect(hint).toContain('attributeName (required')
    expect(hint).not.toContain('className')
  })
})
