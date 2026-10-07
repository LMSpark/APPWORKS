/**
 * $[fieldName] 占位符绑定测试
 *
 * 验证 resolvePlaceholderProps 纯函数的各种场景：
 * 1. 纯占位符替换（保留原始类型）
 * 2. 混合文本替换（string 输出）
 * 3. 嵌套对象 / 数组递归
 * 4. null / undefined 行数据
 * 5. 无占位符时直接透传原引用
 */

import { describe, it, expect } from 'vitest'
import { resolvePlaceholderProps } from '../../../packages/spark-component/src/core/useSparkComponent'

describe('resolvePlaceholderProps', () => {
  const row = {
    name: '张三',
    age: 25,
    status: '在线',
    score: 98.5,
    active: true,
    department: '技术部',
  }

  // ── 纯占位符：保留原始类型 ────────────────────────────────────────────

  it('纯占位符 → 保留 string 类型', () => {
    const props = { label: '$[name]' }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toEqual({ label: '张三' })
    expect(typeof resolved['label']).toBe('string')
  })

  it('纯占位符 → 保留 number 类型', () => {
    const props = { value: '$[age]' }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toEqual({ value: 25 })
    expect(typeof resolved['value']).toBe('number')
  })

  it('纯占位符 → 保留 boolean 类型', () => {
    const props = { checked: '$[active]' }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toEqual({ checked: true })
    expect(typeof resolved['checked']).toBe('boolean')
  })

  // ── 混合文本：总是 string ──────────────────────────────────────────────

  it('混合文本 → string 插值', () => {
    const props = { title: '用户: $[name]' }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toEqual({ title: '用户: 张三' })
  })

  it('多个占位符混合文本', () => {
    const props = { desc: '$[name] - $[department] - 年龄$[age]' }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toEqual({ desc: '张三 - 技术部 - 年龄25' })
  })

  // ── 嵌套对象 / 数组 ───────────────────────────────────────────────────

  it('嵌套对象中的占位符', () => {
    const props = {
      style: { color: '$[status]', fontSize: '14px' },
      label: '$[name]',
    }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toEqual({
      style: { color: '在线', fontSize: '14px' },
      label: '张三',
    })
  })

  it('数组中的占位符', () => {
    const props = {
      tags: ['$[name]', '$[department]', '固定文本'],
    }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toEqual({
      tags: ['张三', '技术部', '固定文本'],
    })
  })

  it('深层嵌套', () => {
    const props = {
      config: {
        header: { title: '欢迎 $[name]' },
        items: [{ label: '$[department]' }],
      },
    }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toEqual({
      config: {
        header: { title: '欢迎 张三' },
        items: [{ label: '技术部' }],
      },
    })
  })

  // ── 边界情况 ──────────────────────────────────────────────────────────

  it('字段不存在 → 混合文本中为空字符串', () => {
    const props = { label: '用户: $[missing]' }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toEqual({ label: '用户: ' })
  })

  it('字段不存在 → 纯占位符为 undefined', () => {
    const props = { value: '$[missing]' }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toEqual({ value: undefined })
  })

  it('row 为 null → 返回原 props', () => {
    const props = { label: '$[name]' }
    const resolved = resolvePlaceholderProps(props, null)
    expect(resolved).toBe(props) // 同一引用
  })

  it('row 为 undefined → 返回原 props', () => {
    const props = { label: '$[name]' }
    const resolved = resolvePlaceholderProps(props, undefined)
    expect(resolved).toBe(props) // 同一引用
  })

  it('无占位符 → 返回原 props 引用（性能优化）', () => {
    const props = { label: '普通文本', count: 42 }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toBe(props)
  })

  it('非 string prop 值不受影响', () => {
    const props = { count: 42, enabled: true, label: '$[name]' }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved).toEqual({ count: 42, enabled: true, label: '张三' })
  })

  it('嵌套无占位符 → 保留原嵌套引用', () => {
    const style = { color: 'red', fontSize: '14px' }
    const props = { style, label: '$[name]' }
    const resolved = resolvePlaceholderProps(props, row)
    expect(resolved['style']).toBe(style) // 无占位符的嵌套对象保持原引用
  })
})
