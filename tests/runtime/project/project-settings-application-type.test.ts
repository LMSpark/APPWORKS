import {describe, expect, it, vi} from 'vitest'

const fixtures = vi.hoisted(() => ({
  application: {} as Record<string, unknown>,
  navigation: {id: 'ROOT-1', projectId: 'APP-1', title: 'Beta', childPlacement: 'header' as const, items: []},
}))

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {
    readRequestScope: () => ({token: 'scope-1', headers: {}}),
  },
  readLowcodeRuntimeNavigation: async () => fixtures.navigation,
}))
vi.mock('@/lowcode/lowcode-application-catalog', () => ({
  readLowcodeApplicationById: vi.fn(async () => fixtures.application),
}))

import {loadProjectRuntimeSettings} from '@/services/project/project-settings'

describe('project settings with incomplete application classification', () => {
  it('omits projectType when the application directory has no readable classification', async () => {
    fixtures.application = {id: 'APP-1', name: 'Beta'}

    const settings = await loadProjectRuntimeSettings('APP-1')

    expect(settings.project).not.toHaveProperty('projectType')
  })

  it.each([
    [true, 'homepage'],
    [false, 'application'],
  ] as const)('preserves known IsSys classification %s', async (isDefault, projectType) => {
    fixtures.application = {id: 'APP-1', name: 'Beta', isDefault}

    const settings = await loadProjectRuntimeSettings('APP-1')

    expect(settings.project.projectType).toBe(projectType)
  })
})
