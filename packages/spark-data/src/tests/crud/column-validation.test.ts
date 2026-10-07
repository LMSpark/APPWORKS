/**
 * 列验证规则提取 - 测试用例
 *
 * 测试范围：
 * 1. extractColumnRules — 从 DataColumn 提取框架无关的验证描述符
 * 2. isColumnRequired — 必填判断逻辑
 * 3. DataValidator 对新增验证属性（minLength/maxLength/min/max/pattern）的支持
 */

import { describe, it, expect } from 'vitest'
import { extractColumnRules, isColumnRequired } from '../../validation/column-validation'
import { createValidator, createSchema } from '../../validation/validation'
import type { DataColumn } from '@spark-appworks/spark-data'

// ===== extractColumnRules =====

describe('extractColumnRules', () => {
  it('无验证属性时返回空数组', () => {
    const col: DataColumn = { name: 'notes', type: 'string' }
    expect(extractColumnRules(col)).toEqual([])
  })

  it('required: true 生成必填规则', () => {
    const col: DataColumn = { name: 'email', type: 'string', label: '邮箱', required: true }
    const rules = extractColumnRules(col)
    expect(rules).toHaveLength(1)
    expect(rules[0]).toEqual({ type: 'required', message: '邮箱不能为空' })
  })

  it('allowDBNull: false 回退为必填', () => {
    const col: DataColumn = { name: 'id', type: 'number', allowDBNull: false }
    const rules = extractColumnRules(col)
    expect(rules.some(r => r.type === 'required')).toBe(true)
  })

  it('required: false 覆盖 allowDBNull: false', () => {
    const col: DataColumn = { name: 'id', type: 'number', required: false, allowDBNull: false }
    const rules = extractColumnRules(col)
    expect(rules.some(r => r.type === 'required')).toBe(false)
  })

  it('字符串列生成 minLength/maxLength 规则', () => {
    const col: DataColumn = { name: 'username', type: 'string', label: '用户名', minLength: 2, maxLength: 20 }
    const rules = extractColumnRules(col)
    expect(rules).toHaveLength(2)
    expect(rules[0]).toEqual({ type: 'minLength', message: '用户名至少2个字符', value: 2 })
    expect(rules[1]).toEqual({ type: 'maxLength', message: '用户名最多20个字符', value: 20 })
  })

  it('数值列生成 min/max 规则', () => {
    const col: DataColumn = { name: 'age', type: 'number', label: '年龄', min: 0, max: 150 }
    const rules = extractColumnRules(col)
    expect(rules).toHaveLength(2)
    expect(rules[0]).toEqual({ type: 'min', message: '年龄不能小于0', value: 0 })
    expect(rules[1]).toEqual({ type: 'max', message: '年龄不能大于150', value: 150 })
  })

  it('数值类型的 minLength/maxLength 不生效', () => {
    const col: DataColumn = { name: 'age', type: 'number', minLength: 1, maxLength: 3 }
    const rules = extractColumnRules(col)
    expect(rules).toHaveLength(0)
  })

  it('字符串类型的 min/max 不生效', () => {
    const col: DataColumn = { name: 'name', type: 'string', min: 0, max: 100 }
    const rules = extractColumnRules(col)
    expect(rules).toHaveLength(0)
  })

  it('pattern 生成正则规则', () => {
    const col: DataColumn = {
      name: 'email', type: 'string', label: '邮箱',
      pattern: '^[\\w.-]+@[\\w.-]+\\.\\w+$',
      patternMessage: '请输入有效的邮箱地址',
    }
    const rules = extractColumnRules(col)
    const patternRule = rules.find(r => r.type === 'pattern')
    expect(patternRule).toBeDefined()
    expect(patternRule!.message).toBe('请输入有效的邮箱地址')
    expect(patternRule!.value).toBe('^[\\w.-]+@[\\w.-]+\\.\\w+$')
  })

  it('pattern 无自定义消息时使用默认提示', () => {
    const col: DataColumn = { name: 'code', type: 'string', label: '编码', pattern: '^[A-Z]+$' }
    const rules = extractColumnRules(col)
    const patternRule = rules.find(r => r.type === 'pattern')
    expect(patternRule!.message).toBe('编码格式不正确')
  })

  it('组合验证：required + maxLength + pattern', () => {
    const col: DataColumn = {
      name: 'phone', type: 'string', label: '手机号',
      required: true, maxLength: 11, pattern: '^1[3-9]\\d{9}$', patternMessage: '手机号格式错误',
    }
    const rules = extractColumnRules(col)
    expect(rules).toHaveLength(3)
    expect(rules.map(r => r.type)).toEqual(['required', 'maxLength', 'pattern'])
  })

  it('label 未设置时回退到 name', () => {
    const col: DataColumn = { name: 'userName', type: 'string', required: true }
    const rules = extractColumnRules(col)
    expect(rules[0]!.message).toBe('userName不能为空')
  })
})

// ===== isColumnRequired =====

describe('isColumnRequired', () => {
  it('required: true → 必填', () => {
    expect(isColumnRequired({ name: 'a', type: 'string', required: true })).toBe(true)
  })

  it('allowDBNull: false（无 required）→ 必填', () => {
    expect(isColumnRequired({ name: 'a', type: 'string', allowDBNull: false })).toBe(true)
  })

  it('required: false → 非必填（即使 allowDBNull: false）', () => {
    expect(isColumnRequired({ name: 'a', type: 'string', required: false, allowDBNull: false })).toBe(false)
  })

  it('无 required 且 allowDBNull 未设置 → 非必填', () => {
    expect(isColumnRequired({ name: 'a', type: 'string' })).toBe(false)
  })
})

// ===== DataValidator 新增属性支持 =====

describe('DataValidator - 新增验证属性', () => {
  it('minLength 校验：字符串过短', () => {
    const columns: DataColumn[] = [{ name: 'name', type: 'string', minLength: 2 }]
    const validator = createValidator(createSchema(columns))
    const result = validator.validate({ name: 'A' })
    expect(result.valid).toBe(false)
    expect(result.errors[0]!.code).toBe('MIN_LENGTH')
  })

  it('maxLength 校验：字符串过长', () => {
    const columns: DataColumn[] = [{ name: 'name', type: 'string', maxLength: 5 }]
    const validator = createValidator(createSchema(columns))
    const result = validator.validate({ name: 'TooLongName' })
    expect(result.valid).toBe(false)
    expect(result.errors[0]!.code).toBe('MAX_LENGTH')
  })

  it('min 校验：数值过小', () => {
    const columns: DataColumn[] = [{ name: 'age', type: 'number', min: 0 }]
    const validator = createValidator(createSchema(columns))
    const result = validator.validate({ age: -1 })
    expect(result.valid).toBe(false)
    expect(result.errors[0]!.code).toBe('MIN_VALUE')
  })

  it('max 校验：数值过大', () => {
    const columns: DataColumn[] = [{ name: 'score', type: 'number', max: 100 }]
    const validator = createValidator(createSchema(columns))
    const result = validator.validate({ score: 150 })
    expect(result.valid).toBe(false)
    expect(result.errors[0]!.code).toBe('MAX_VALUE')
  })

  it('pattern 校验：不匹配正则', () => {
    const columns: DataColumn[] = [{ name: 'email', type: 'string', pattern: '^[\\w.-]+@[\\w.-]+\\.\\w+$' }]
    const validator = createValidator(createSchema(columns))
    const result = validator.validate({ email: 'not-an-email' })
    expect(result.valid).toBe(false)
    expect(result.errors[0]!.code).toBe('PATTERN')
  })

  it('pattern 校验：匹配正则通过', () => {
    const columns: DataColumn[] = [{ name: 'email', type: 'string', pattern: '^[\\w.-]+@[\\w.-]+\\.\\w+$' }]
    const validator = createValidator(createSchema(columns))
    const result = validator.validate({ email: 'test@example.com' })
    expect(result.valid).toBe(true)
  })

  it('pattern + patternMessage 自定义消息', () => {
    const columns: DataColumn[] = [{
      name: 'phone', type: 'string',
      pattern: '^1[3-9]\\d{9}$', patternMessage: '手机号格式不对',
    }]
    const validator = createValidator(createSchema(columns))
    const result = validator.validate({ phone: '12345' })
    expect(result.errors[0]!.message).toBe('手机号格式不对')
  })

  it('required: true 生效（替代 allowDBNull）', () => {
    const columns: DataColumn[] = [{ name: 'name', type: 'string', required: true }]
    const validator = createValidator(createSchema(columns))
    const result = validator.validate({ name: '' })
    expect(result.valid).toBe(false)
    expect(result.errors[0]!.code).toBe('REQUIRED')
  })

  it('组合校验：required + minLength + maxLength', () => {
    const columns: DataColumn[] = [{
      name: 'code', type: 'string', required: true, minLength: 3, maxLength: 10,
    }]
    const validator = createValidator(createSchema(columns))

    // 空值 → required 失败（后续校验跳过）
    expect(validator.validate({ code: '' }).errors).toHaveLength(1)

    // 太短
    const short = validator.validate({ code: 'AB' })
    expect(short.errors.some(e => e.code === 'MIN_LENGTH')).toBe(true)

    // 太长
    const long = validator.validate({ code: 'ABCDEFGHIJK' })
    expect(long.errors.some(e => e.code === 'MAX_LENGTH')).toBe(true)

    // 正好
    expect(validator.validate({ code: 'ABCDE' }).valid).toBe(true)
  })

  it('null/undefined 值跳过长度和范围校验（allowDBNull: true）', () => {
    const columns: DataColumn[] = [{
      name: 'nickname', type: 'string', allowDBNull: true, minLength: 2, maxLength: 10,
    }]
    const validator = createValidator(createSchema(columns))
    expect(validator.validate({ nickname: null }).valid).toBe(true)
    expect(validator.validate({ nickname: undefined }).valid).toBe(true)
  })
})
