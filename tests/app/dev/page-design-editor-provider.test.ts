import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  createHeadlessPageDesignEditor,
  createPageDesignEditorGetter,
  resolvePageDesignEditor,
} from '@/services/page-design/page-design-headless'
import { installAuthenticatedLowcodeTestSession, restoreLowcodeTestSession } from '../../support/helpers/authenticated-lowcode-session'

describe('page-design-editor-provider', () => {
  beforeEach(() => installAuthenticatedLowcodeTestSession())
  afterEach(() => restoreLowcodeTestSession())

  it('isolated mode resolves from headless registry', () => {
    const headless = createHeadlessPageDesignEditor()
    const registry = new Map<string, ProjectWorkspace>([['orders', headless]])

    const resolved = resolvePageDesignEditor(
      { moduleInstanceId: 'orders' },
      registry,
    )
    expect(resolved).toBe(headless)
  })

  it('createPageDesignEditorGetter throws when headless entry is missing', () => {
    const getter = createPageDesignEditorGetter(new Map())
    expect(() => getter({ moduleInstanceId: 'missing' })).toThrow(/not prepared/)
  })
})
