/**
 * spark-utils 类型系统测试
 * 
 * 验证核心类型：
 * - Logger 基本功能
 */

import { describe, it, expect } from 'vitest'
import {
  Logger,
} from '@spark-appworks/spark-utils'
import type {
  LoggerApi,
} from '@spark-appworks/spark-utils'

// ============================================================================
// Logger 基本功能
// ============================================================================

describe('Logger basic', () => {
  it('creates logger without context', () => {
    const logger = Logger()
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })

  it('logger conforms to LoggerApi contract', () => {
    const logger: LoggerApi = Logger()
    // 每个方法都接受 ...args: unknown[]
    logger.debug('test debug')
    logger.info('test info')
    logger.warn('test warn')
    logger.error('test error')
  })
})

