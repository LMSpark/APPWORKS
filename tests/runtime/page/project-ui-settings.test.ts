import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PROJECT_UI_SETTINGS,
  getProjectUiSettingsStorageKey,
  loadProjectUiSettings,
  saveProjectUiSettings,
} from '../../../src/services/project/project-settings'

describe('project UI settings storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns defaults when a scoped record does not exist', () => {
    expect(loadProjectUiSettings('tenant:lmspark:project:homepage')).toEqual(DEFAULT_PROJECT_UI_SETTINGS)
  })

  it('stores and restores settings by scope', () => {
    saveProjectUiSettings('tenant:lmspark:project:homepage', {
      headerFirst: true,
      sidebarCollapsed: true,
      showFooter: false,
      pageMode: 'single',
    })
    saveProjectUiSettings('tenant:lmspark:project:engineering-pm', {
      headerFirst: false,
      sidebarCollapsed: false,
      showFooter: true,
      pageMode: 'multi',
    })

    expect(loadProjectUiSettings('tenant:lmspark:project:homepage')).toEqual({
      headerFirst: true,
      sidebarCollapsed: true,
      showFooter: false,
      pageMode: 'single',
    })
    expect(loadProjectUiSettings('tenant:lmspark:project:engineering-pm')).toEqual({
      headerFirst: false,
      sidebarCollapsed: false,
      showFooter: true,
      pageMode: 'multi',
    })
  })

  it('uses the scoped storage key format', () => {
    expect(getProjectUiSettingsStorageKey('tenant:lmspark:project:homepage')).toBe(
      'spark-ui-settings:tenant:lmspark:project:homepage',
    )
  })
})
