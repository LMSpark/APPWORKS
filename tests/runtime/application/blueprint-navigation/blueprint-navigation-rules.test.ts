import {describe, expect, it} from 'vitest'
import {
  blueprintChildPlacementOptions,
  blueprintNavigationTargetError,
  blueprintOpenModeOptions,
} from '@/services/project/blueprint-navigation/blueprint-navigation-rules'

describe('蓝图导航属性规则', () => {
  it('accepts empty targets and canonical vue:/ resources with query or hash', () => {
    for (const value of [undefined, null, '', '   ', 'vue:/features/a/b-page', 'vue:/features/a?x=1', 'vue:/a#Top']) {
      expect(blueprintNavigationTargetError(value)).toBe('')
    }
  })

  it.each([
    [12, '必须是文本'],
    [' vue:/a', '首尾空白'],
    ['/features/a', 'vue:/'],
    ['vue:/', '根路径'],
    ['vue:/Features/a', '小写'],
    ['vue:/a\\b', '反斜杠'],
    ['vue:/a//b', '连续斜杠'],
    ['vue:/a/', '斜杠结尾'],
    ['vue:/a/b.vue', '.vue'],
  ])('rejects %j', (value, reason) => {
    expect(blueprintNavigationTargetError(value)).toContain(reason)
  })

  it('keeps the wire type of open modes and surfaces unrecognised saved values', () => {
    expect(blueprintOpenModeOptions(true, 3).map(option => option.value)).toEqual([4, 3, 2, 1, 0])
    expect(blueprintOpenModeOptions(false, '3').map(option => option.value)).toEqual(['4', '3', '2', '1', '0'])
    expect(blueprintOpenModeOptions(true, 9).at(-1)).toEqual({value: 9, label: '未识别的已保存值：9'})
  })

  it('preserves differently cased placements instead of normalising them', () => {
    expect(blueprintChildPlacementOptions('Left')).toHaveLength(6)
    expect(blueprintChildPlacementOptions('left').at(-1)).toEqual({value: 'left', label: '左侧（已保存为 left）'})
    expect(blueprintChildPlacementOptions('Bottom').at(-1)).toEqual({value: 'Bottom', label: '未识别的已保存值：Bottom'})
  })
})
