import { describe, expect, it } from 'vitest'

import { executeModuleScript } from '../../agent/native-runtime/native-script-sandbox'

describe('executeModuleScript', () => {
  it('returns generic recovery hints without business method names', async () => {
    const result = await executeModuleScript(
      'await this.missingAction({ pageId: "demo" })',
      { missingAction: async () => { throw new Error('editDataSet is not a function') } },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    const hint = result.checks?.[0]?.hint ?? ''
    expect(hint).toContain('model_action_guide')
    expect(hint).not.toContain('openPageDesign')
    expect(hint).not.toContain('editDataSet')
    expect(hint).not.toContain('editNodeTree')
  })

  it('rejects empty script bodies with generic shape guidance', async () => {
    const { executeAiNativeScript } = await import('../../agent/native-runtime/native-script-runner')
    const result = await executeAiNativeScript({
      instance: {},
      metadata: {
        schemaVersion: 1,
        rootApi: { kind: 'demo', name: 'Demo', description: 'demo', actions: [] },
      },
      script: '   ',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    const hint = result.checks?.[0]?.hint ?? ''
    expect(hint).toContain('JavaScript async function body')
    expect(hint).not.toContain('openPageDesign')
  }, 60000)
})
