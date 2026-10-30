import {afterEach, describe, expect, it, vi} from 'vitest'
import {createHeadlessProjectPlanningEditor} from '@/services/project-planning/project-planning-headless'

const mocks=vi.hoisted(()=>({
  createLowcodeProjectGateways:vi.fn(),
  readLowcodePrincipal:vi.fn(),
}))

vi.mock('@/lowcode/lowcode-runtime',()=>({
  createLowcodeProjectGateways:mocks.createLowcodeProjectGateways,
  readLowcodePrincipal:mocks.readLowcodePrincipal,
}))

describe('headless project planning workspace identity',()=>{
  afterEach(()=>vi.clearAllMocks())

  it('uses projectId only and does not infer project tenant identity from enterpriseName',()=>{
    mocks.readLowcodePrincipal.mockReturnValue({enterpriseName:'enterprise-is-not-a-tenant-id',applicationId:'session-project'})
    mocks.createLowcodeProjectGateways.mockReturnValue({blueprint:{}})

    const editor=createHeadlessProjectPlanningEditor({projectId:'target-project'})

    expect(mocks.createLowcodeProjectGateways).toHaveBeenCalledWith('target-project')
    expect(editor.project.projectId).toBe('target-project')
    expect(editor.project.projectInfo).not.toHaveProperty('tenantId')
  })
})
