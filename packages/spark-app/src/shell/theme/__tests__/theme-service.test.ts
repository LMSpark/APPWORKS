/**
 * ThemeService 测试
 *
 * 覆盖：
 * - createThemeService 创建实例
 * - mode / current / isDark 属性
 * - setMode() 切换模式
 * - toggle() 切换明暗
 * - html.dark class 自动切换
 * - localStorage 持久化
 * - AppThemeCapability 接口兼容
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { createThemeService } from '../index'

describe('ThemeService', () => {
  let scope: ReturnType<typeof effectScope>

  beforeEach(() => {
    // 清理 html class 和 localStorage
    document.documentElement.className = ''
    localStorage.clear()
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    document.documentElement.className = ''
    localStorage.clear()
  })

  it('should create with default options (auto mode)', () => {
    scope.run(() => {
      const theme = createThemeService()
      // auto mode resolves to light or dark based on system preference
      // jsdom prefers-color-scheme defaults to no-preference → light
      expect(theme.mode).toBe('auto')
      expect(['light', 'dark']).toContain(theme.current)
      expect(typeof theme.isDark).toBe('boolean')
    })
  })

  it('should create with explicit light mode', () => {
    scope.run(() => {
      const theme = createThemeService({ initialMode: 'light' })
      expect(theme.mode).toBe('light')
      expect(theme.current).toBe('light')
      expect(theme.isDark).toBe(false)
    })
  })

  it('should create with explicit dark mode', () => {
    scope.run(() => {
      const theme = createThemeService({ initialMode: 'dark' })
      expect(theme.mode).toBe('dark')
      expect(theme.current).toBe('dark')
      expect(theme.isDark).toBe(true)
    })
  })

  it('should switch mode via setMode()', () => {
    scope.run(() => {
      const theme = createThemeService({ initialMode: 'light' })
      expect(theme.isDark).toBe(false)

      theme.setMode('dark')
      expect(theme.mode).toBe('dark')
      expect(theme.current).toBe('dark')
      expect(theme.isDark).toBe(true)

      theme.setMode('light')
      expect(theme.mode).toBe('light')
      expect(theme.isDark).toBe(false)
    })
  })

  it('should toggle between light and dark', () => {
    scope.run(() => {
      const theme = createThemeService({ initialMode: 'light' })
      expect(theme.isDark).toBe(false)

      theme.toggle()
      expect(theme.isDark).toBe(true)
      expect(theme.current).toBe('dark')

      theme.toggle()
      expect(theme.isDark).toBe(false)
      expect(theme.current).toBe('light')
    })
  })

  it('should apply dark class to html element', async () => {
    await scope.run(async () => {
      createThemeService({ initialMode: 'dark' })
      await nextTick()
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('should remove dark class when switching to light', async () => {
    await scope.run(async () => {
      const theme = createThemeService({ initialMode: 'dark' })
      await nextTick()
      expect(document.documentElement.classList.contains('dark')).toBe(true)

      theme.setMode('light')
      await nextTick()
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  it('should persist mode to localStorage with custom key', () => {
    const storageKey = 'test-theme-key'
    scope.run(() => {
      const theme = createThemeService({ initialMode: 'dark', storageKey })
      expect(theme.isDark).toBe(true)
      expect(localStorage.getItem(storageKey)).toBe('dark')
    })
  })

  it('should restore mode from localStorage', () => {
    const storageKey = 'test-restore-key'
    localStorage.setItem(storageKey, 'dark')

    scope.run(() => {
      const theme = createThemeService({ storageKey })
      expect(theme.current).toBe('dark')
      expect(theme.isDark).toBe(true)
    })
  })

  it('should expose reactive modeRef and isDarkRef', () => {
    scope.run(() => {
      const theme = createThemeService({ initialMode: 'light' })
      expect(theme.modeRef.value).toBe('light')
      expect(theme.isDarkRef.value).toBe(false)

      theme.setMode('dark')
      expect(theme.modeRef.value).toBe('dark')
      expect(theme.isDarkRef.value).toBe(true)
    })
  })

  it('should satisfy AppThemeCapability contract', () => {
    scope.run(() => {
      const theme = createThemeService()
      // All AppThemeCapability members must exist
      expect(typeof theme.current).toBe('string')
      expect(typeof theme.mode).toBe('string')
      expect(typeof theme.isDark).toBe('boolean')
      expect(typeof theme.setMode).toBe('function')
      expect(typeof theme.toggle).toBe('function')
    })
  })
})
