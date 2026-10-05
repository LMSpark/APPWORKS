import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { createThemeService } from '../theme'

describe('ThemeService scoped storage', () => {
  let scope: ReturnType<typeof effectScope>

  beforeEach(() => {
    document.documentElement.className = ''
    localStorage.clear()
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    document.documentElement.className = ''
    localStorage.clear()
  })

  it('isolates theme mode by storage scope', () => {
    scope.run(() => {
      const theme = createThemeService({ initialMode: 'light' })

      theme.setStorageScope('tenant:lmspark:project:homepage')
      theme.setMode('dark')
      expect(localStorage.getItem('spark-theme-mode:tenant:lmspark:project:homepage')).toBe('dark')

      theme.setStorageScope('tenant:lmspark:project:engineering-pm')
      expect(theme.mode).toBe('light')
      expect(localStorage.getItem('spark-theme-mode:tenant:lmspark:project:engineering-pm')).toBe('light')

      theme.setStorageScope('tenant:lmspark:project:homepage')
      expect(theme.mode).toBe('dark')
    })
  })

  it('does not inherit global theme mode into a scoped key', () => {
    localStorage.setItem('spark-theme-mode', 'dark')

    scope.run(() => {
      const theme = createThemeService({ initialMode: 'light' })

      theme.setStorageScope('tenant:lmspark:project:homepage')

      expect(theme.mode).toBe('light')
      expect(localStorage.getItem('spark-theme-mode:tenant:lmspark:project:homepage')).toBe('light')
      expect(localStorage.getItem('spark-theme-mode')).toBe('dark')
    })
  })

  it('updates document dark state when switching scopes', async () => {
    await scope.run(async () => {
      const theme = createThemeService({ initialMode: 'light' })

      theme.setStorageScope('tenant:lmspark:project:homepage')
      theme.setMode('dark')
      await nextTick()
      expect(document.documentElement.classList.contains('dark')).toBe(true)

      theme.setStorageScope('tenant:lmspark:project:engineering-pm')
      await nextTick()
      expect(theme.mode).toBe('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(document.documentElement.getAttribute('data-vxe-ui-theme')).toBe('light')
    })
  })
})
