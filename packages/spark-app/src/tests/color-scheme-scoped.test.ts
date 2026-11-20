import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('useColorScheme scoped storage', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
  })

  it('isolates color scheme state by storage scope', async () => {
    const { setColorSchemeStorageScope, useColorScheme } = await import('../navigation/useColorScheme')
    const scheme = useColorScheme()

    setColorSchemeStorageScope('tenant:lmspark:project:homepage')
    scheme.setPrimaryColor('#722ed1')
    scheme.setNavPreset(3)

    setColorSchemeStorageScope('tenant:lmspark:project:engineering-pm')
    expect(scheme.primaryColor.value).toBe('#409eff')
    expect(scheme.navPresetIndex.value).toBe(0)

    scheme.setStylePreset(1)
    expect(scheme.primaryColor.value).toBe('#2f6feb')

    setColorSchemeStorageScope('tenant:lmspark:project:homepage')
    expect(scheme.primaryColor.value).toBe('#722ed1')
    expect(scheme.navPresetIndex.value).toBe(3)
    expect(scheme.stylePresetIndex.value).toBe(0)
  }, 20000)

  it('does not inherit global color scheme into a scoped key', async () => {
    const globalState = { primaryColor: '#14b8a6', navIndex: 6, styleIndex: 3 }
    localStorage.setItem('spark-color-scheme', JSON.stringify(globalState))

    const { setColorSchemeStorageScope, useColorScheme } = await import('../navigation/useColorScheme')
    const scheme = useColorScheme()

    setColorSchemeStorageScope('tenant:lmspark:project:homepage')

    expect(scheme.primaryColor.value).toBe('#409eff')
    expect(scheme.navPresetIndex.value).toBe(0)
    expect(scheme.stylePresetIndex.value).toBe(0)
    expect(localStorage.getItem('spark-color-scheme:tenant:lmspark:project:homepage')).toBe(JSON.stringify({
      primaryColor: '#409eff',
      navIndex: 0,
      styleIndex: 0,
    }))
    expect(localStorage.getItem('spark-color-scheme')).toBe(JSON.stringify(globalState))
  }, 20000)

  it('refreshes CSS variables when switching scopes', async () => {
    const { setColorSchemeStorageScope, useColorScheme } = await import('../navigation/useColorScheme')
    const scheme = useColorScheme()

    setColorSchemeStorageScope('tenant:lmspark:project:homepage')
    scheme.setPrimaryColor('#722ed1')
    expect(document.documentElement.style.getPropertyValue('--el-color-primary')).toBe('#722ed1')

    setColorSchemeStorageScope('tenant:lmspark:project:engineering-pm')
    expect(document.documentElement.style.getPropertyValue('--el-color-primary')).toBe('#409eff')
  }, 20000)
})
