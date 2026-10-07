import { describe, expect, it } from 'vitest'
import { createAiAgentTurnCallbacks } from '@/services/ai/ai-turn-bridge'

describe('ai-turn-bridge', () => {
  it('exports lowcode turn callbacks for per-run hosts', () => {
    const callbacks = createAiAgentTurnCallbacks()
    expect(typeof callbacks.executeTurn).toBe('function')
    expect(typeof callbacks.appendMessages).toBe('function')
  })
})
