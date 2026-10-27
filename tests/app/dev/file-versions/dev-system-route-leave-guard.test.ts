import { describe, expect, it } from 'vitest'
import { canLeaveDevSystem } from '@/views/app/dev-system/useDevSystem'

describe('DevSystem pending file receipt route guard', () => {
  it('keeps the active owner mounted while a file save receipt needs verification', () => {
    expect(canLeaveDevSystem(true)).toBe(false)
  })

  it('allows navigation when no file save receipt is pending', () => {
    expect(canLeaveDevSystem(false)).toBe(true)
  })
})
