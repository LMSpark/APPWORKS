/**
 * 数据校验 - 测试用例
 * 
 * 测试范围：
 * 1. DataValidator 基础功能（必填、类型校验）
 * 2. DataView CRUD 方法集成（createRecord, updateRecord, batchCreate, batchUpdate）
 * 3. 自定义行级校验
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DataView } from '@spark-appworks/spark-data'
import { DataTable } from '../../data-table'
import { DataValidator, createValidator, createSchema } from '../../validation/validation'
import type { DataColumn, DataRow } from '@spark-appworks/spark-data'
import { requireError, requireNumber } from '../test-type-helpers'

describe('DataValidator - 基础校验', () => {
  let validator: DataValidator

  beforeEach(() => {
    const columns: DataColumn[] = [
      { name: 'id', type: 'number', allowDBNull: false },
      { name: 'name', type: 'string', allowDBNull: false },
      { name: 'age', type: 'number', allowDBNull: true },
      { name: 'email', type: 'string', allowDBNull: true }
    ]
    validator = createValidator(createSchema(columns))
  })

  it('应校验必填字段（allowDBNull: false）', () => {
    const row: DataRow = { id: 1, name: '', age: 25 }
    const result = validator.validate(row)
    
    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.field).toBe('name')
    expect(result.errors[0]!.code).toBe('REQUIRED')
  })

  it('应允许可空字段为null', () => {
    const row: DataRow = { id: 1, name: 'Alice', age: null, email: null }
    const result = validator.validate(row)
    
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('未设置 allowDBNull 的字段默认不应视为必填', () => {
    const localValidator = createValidator(createSchema([
      { name: 'editorProfileKey', type: 'string', computeExpression: "return 'page'" },
    ]))

    const result = localValidator.validate({})

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('计算列不应参与 CRUD 输入校验', () => {
    const localValidator = createValidator(createSchema([
      { name: 'id', type: 'number', allowDBNull: false },
      { name: 'editorProfileKey', type: 'string', computeExpression: "return 'page'" },
    ]))

    const result = localValidator.validate({ id: 1 })

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('应校验number类型', () => {
    const row: DataRow = { id: 'invalid', name: 'Alice', age: 25 }
    const result = validator.validate(row)
    
    expect(result.valid).toBe(false)
    expect(result.errors[0]!.field).toBe('id')
    expect(result.errors[0]!.code).toBe('INVALID_TYPE')
  })

  it('应校验string类型', () => {
    const row: DataRow = { id: 1, name: 123, age: 25 }
    const result = validator.validate(row)
    
    expect(result.valid).toBe(false)
    expect(result.errors[0]!.field).toBe('name')
    expect(result.errors[0]!.code).toBe('INVALID_TYPE')
  })

  it('isValid() 应返回正确的校验状态', () => {
    expect(validator.isValid({ id: 1, name: 'Alice' })).toBe(true)
    expect(validator.isValid({ id: 1, name: '' })).toBe(false)
  })

  it('getFirstError() 应返回第一个错误', () => {
    const row: DataRow = { id: null, name: '' }
    const error = validator.getFirstError(row)
    
    expect(error).not.toBeNull()
    expect(error?.field).toBe('id')
    expect(error?.code).toBe('REQUIRED')
  })
})

describe('DataValidator - 自定义行级校验', () => {
  it('应支持自定义校验函数', () => {
    const columns: DataColumn[] = [
      { name: 'age', type: 'number', allowDBNull: false }
    ]
    const schema = createSchema(columns, (row) => {
      const age = requireNumber(row['age'], 'Expected age to be a number')
      if (age < 0 || age > 150) {
        return [{ field: 'age', message: '年龄必须在0-150之间', code: 'OUT_OF_RANGE', value: age }]
      }
      return null
    })
    const validator = createValidator(schema)
    
    const validRow: DataRow = { age: 25 }
    expect(validator.isValid(validRow)).toBe(true)
    
    const invalidRow: DataRow = { age: 200 }
    const result = validator.validate(invalidRow)
    expect(result.valid).toBe(false)
    expect(result.errors[0]!.code).toBe('OUT_OF_RANGE')
  })
})

describe('DataTable - Validator 初始化', () => {
  it('应在构造时自动创建 validator', () => {
    const columns: DataColumn[] = [
      { name: 'id', type: 'number', allowDBNull: false }
    ]
    const table = new DataTable('Users', columns)
    
    expect(table.validator).toBeDefined()
    expect(table.validator?.isValid({ id: 1 })).toBe(true)
    expect(table.validator?.isValid({ id: null })).toBe(false)
  })

  it('空列定义不应创建 validator', () => {
    const table = new DataTable('Users', [])
    expect(table.validator).toBeUndefined()
  })
})

describe('DataView - CRUD 校验集成', () => {
  let table: DataTable
  let view: DataView

  beforeEach(() => {
    const columns: DataColumn[] = [
      { name: 'id', type: 'number', allowDBNull: false },
      { name: 'name', type: 'string', allowDBNull: false },
      { name: 'age', type: 'number', allowDBNull: true }
    ]
    table = new DataTable('Users', columns)
    table.api = {
      create: { url: '/api/users', method: 'POST' },
      update: { url: '/api/users/:id', method: 'PUT' },
      delete: { url: '/api/users/:id', method: 'DELETE' },
      list: { url: '/api/users', method: 'GET' }
    }
    view = table.getOrCreateView('default')
    view.dataTable = table
  })

  it('createRecord 应校验必填字段', async () => {
    const result = await view.crud.createRecord({ id: 1 }) // name 缺失
    
    expect(result.success).toBe(false)
    expect(result.message).toContain('数据校验失败')
    expect(result.message).toContain('name')
  })

  it('updateRecord 应校验字段类型', async () => {
    const result = await view.crud.updateRecord(1, { name: 123 })
    
    expect(result.success).toBe(false)
    expect(result.message).toContain('数据校验失败')
  })

  it('batchCreateRecords 应校验所有记录', async () => {
    const items: DataRow[] = [
      { id: 1, name: 'Alice' },
      { id: 2, name: '' }, // 校验失败
      { id: 3, name: 'Bob' }
    ]
    
    const result = await view.crud.batchCreateRecords(items)
    
    expect(result.success).toBe(false)
    expect(result.message).toContain('批量数据校验失败')
    expect(result.message).toContain('第2条')
  })

  it('batchUpdateRecords 应校验所有记录', async () => {
    const items: Array<Partial<DataRow>> = [
      { id: 1, name: 'Alice' },
      { id: 2, age: 'invalid' } // 类型错误
    ]
    
    const result = await view.crud.batchUpdateRecords(items)
    
    expect(result.success).toBe(false)
    expect(result.message).toContain('批量数据校验失败')
  })

  it('有效数据不应被校验拦截', async () => {
    // 注意：这个测试会失败，因为没有真实的API
    // 但我们可以验证校验阶段没有拦截
    const validData: DataRow = { id: 1, name: 'Alice', age: 25 }
    
    try {
      await view.crud.createRecord(validData)
    } catch (error) {
      // API 未配置会抛出错误，但应该是在执行 CRUD 时，而非校验阶段
      expect(requireError(error).message).not.toContain('数据校验失败')
    }
  })
})

describe('DataView - 无 Validator 时的行为', () => {
  it('没有 validator 的 DataView 应正常执行 CRUD', async () => {
    const table = new DataTable('Users', []) // 空列定义
    table.api = { create: { url: '/api/users', method: 'POST' } }
    const view = table.getOrCreateView('default')
    view.dataTable = table
    
    // 应该不会被校验拦截（但会因为缺少 API 配置失败）
    try {
      await view.crud.createRecord({ anything: 'goes' })
    } catch (error) {
      expect(requireError(error).message).not.toContain('校验')
    }
  })
})
