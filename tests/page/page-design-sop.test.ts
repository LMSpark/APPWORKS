import { describe, expect, it } from 'vitest'
import {
  buildPageDesignToolLoopNudge,
  formatPageDesignSystemPrompt,
} from '@/services/page-design/page-design-agent-workflow-binding'
import { PAGE_DATA_DESIGN_ALLOWED_OPERATIONS } from '@/services/page-data-design/page-data-design-agent-run-provider'

const FIXTURE_PAGE_ID = 'leave-request-page'

const baseInput = {
  pageId: FIXTURE_PAGE_ID,
  description: '补主从表',
  effectiveDescription: '请假单列表需要明细表',
  planningTitle: '请假申请',
  planningPath: '/leave-request',
  projectId: 'homepage',
} as const

describe('buildPageDesignToolLoopNudge', () => {
  it('interpolates pageId with current script contract', () => {
    const nudge = buildPageDesignToolLoopNudge('model_script_retry', FIXTURE_PAGE_ID)
    expect(nudge).toContain(FIXTURE_PAGE_ID)
    expect(nudge).toContain('RECOVERY_HINT')
    expect(nudge).not.toContain('createTable')
    expect(nudge).toContain('openPageDesign')
    expect(nudge).toContain('字符串 pageId')
  })

  it('nudges execution phase with pageId context only', () => {
    const nudge = buildPageDesignToolLoopNudge('execution_phase', FIXTURE_PAGE_ID)
    expect(nudge).toContain(FIXTURE_PAGE_ID)
    expect(nudge).toContain('model_script')
    expect(nudge).toContain('目录/指南阶段已完成')
    expect(nudge).toContain('setFileText')
  })

  it('uses data-only nudges when allowedOperations is pageDataDesign preset', () => {
    const nudge = buildPageDesignToolLoopNudge(
      'execution_phase',
      FIXTURE_PAGE_ID,
      PAGE_DATA_DESIGN_ALLOWED_OPERATIONS,
    )
    expect(nudge).toContain('editDataSet')
    expect(nudge).toContain('pagedata.json')
    expect(nudge).toContain('nodeTree')
  })
})

describe('formatPageDesignSystemPrompt', () => {
  it('includes data-only boundary when allowedOperations is pageDataDesign preset', () => {
    const prompt = formatPageDesignSystemPrompt({
      ...baseInput,
      allowedOperations: PAGE_DATA_DESIGN_ALLOWED_OPERATIONS,
    })
    expect(prompt).toContain('pageDataDesign preset')
    expect(prompt).toContain('pagedata.json')
    expect(prompt).toContain('禁止 editNodeTree')
    expect(prompt).toContain('model_action_guide 只用 kind / actionName')
    expect(prompt).toContain('禁止 member / select / query')
    expect(prompt).not.toContain('ConfigPageNode')
  })

  it('uses full pageDesign knowledge index without data-only boundary by default', () => {
    const prompt = formatPageDesignSystemPrompt({ ...baseInput })
    expect(prompt).toContain('ConfigPageNode')
    expect(prompt).toContain('model_query 只用 kind / keyword / includeMembers')
    expect(prompt).toContain('禁止 member / select / query')
    expect(prompt).toContain('script 是 JavaScript async function body')
    expect(prompt).toContain('style.css')
    expect(prompt).not.toContain('pageDataDesign preset')
  })
})
