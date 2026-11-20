import { describe, expect, it } from 'vitest'

import { enrichFunctionCallResult } from '../../agent/tool-loop/function-call-recovery-enricher'
import { CLASS_MODEL_TOOL_NAMES } from '../../class-model'

describe('enrichFunctionCallResult', () => {
  const removedToolPrefix = ['module', ''].join('_')
  const removedFindToolName = ['module', 'find'].join('_')

  it('adds ClassModel schema recovery checks for invalid tool args', () => {
    const invalidArgs = enrichFunctionCallResult({
      protocolToolName: CLASS_MODEL_TOOL_NAMES.actionGuide,
      args: { kind: 'task', actionName: 'doWork' },
      callResult: {
        ok: false,
        code: 'INVALID_TOOL_ARGS',
        msg: 'missing args',
        fix: 'fix shape',
      },
    })

    expect(invalidArgs.ok).toBe(false)
    if (invalidArgs.ok) return
    expect(invalidArgs.fix).toContain('model_action_guide')
    expect(invalidArgs.checks?.some(check => check.message.includes('actionName'))).toBe(true)
    expect(invalidArgs.checks?.some(check => check.message.includes('model_script 形状'))).toBe(true)
    expect(invalidArgs.checks?.some(check => check.message.includes(removedToolPrefix))).toBe(false)
  })

  it('adds ClassModel script recovery hints without business method names', () => {
    const scriptFailed = enrichFunctionCallResult({
      protocolToolName: CLASS_MODEL_TOOL_NAMES.script,
      args: { script: 'page.editDataSet({})' },
      callResult: {
        ok: false,
        code: 'SCRIPT_EXECUTION_FAILED',
        msg: 'editDataSet is not a function',
        fix: 'fix script',
      },
    })

    expect(scriptFailed.ok).toBe(false)
    if (scriptFailed.ok) return
    expect(scriptFailed.checks?.some(check => check.message.includes('model_script'))).toBe(true)
    expect(scriptFailed.checks?.some(check => check.message.includes('openPageDesign'))).toBe(false)
    expect(scriptFailed.checks?.some(check => check.message.includes(removedFindToolName))).toBe(false)
  })

  it('merges business recovery hints when enrichRecoveryHints is provided', () => {
    const scriptFailed = enrichFunctionCallResult(
      {
        protocolToolName: CLASS_MODEL_TOOL_NAMES.script,
        args: { script: 'page.editDataSet({})' },
        callResult: {
          ok: false,
          code: 'SCRIPT_EXECUTION_FAILED',
          msg: 'editDataSet is not a function',
          fix: 'fix script',
        },
      },
      {
        enrichRecoveryHints: () => [
          '必须先 await this.openPageDesign({ pageId }) 得到 page，再 page.editDataSet(async ds => ...)。',
        ],
      },
    )

    expect(scriptFailed.ok).toBe(false)
    if (scriptFailed.ok) return
    expect(scriptFailed.checks?.some(check => check.message.includes('openPageDesign'))).toBe(true)
  })

  it('does not add mutator callback hints without enrichRecoveryHints', () => {
    const schemaFailed = enrichFunctionCallResult({
      protocolToolName: CLASS_MODEL_TOOL_NAMES.script,
      args: { script: 'await page.editDataSet({ tableName: "x" })' },
      callResult: {
        ok: false,
        code: 'SCHEMA_VALIDATION_FAILED',
        msg: 'editDataSet requires a callback argument',
        fix: 'fix callback',
      },
    })

    expect(schemaFailed.ok).toBe(false)
    if (schemaFailed.ok) return
    expect(schemaFailed.checks?.some(check => check.message.includes('createTable'))).toBe(false)
  })

  it('adds native tool schema recovery hint for invalid model_query args', () => {
    const invalidQuery = enrichFunctionCallResult({
      protocolToolName: CLASS_MODEL_TOOL_NAMES.query,
      args: { member: 'rows' },
      callResult: {
        ok: false,
        code: 'INVALID_CLASS_MODEL_TOOL_ARGS',
        msg: '工具 "model_query" 不接受参数: member。允许参数: kind, keyword, includeMembers。',
        fix: 'use schema',
      },
    })

    expect(invalidQuery.ok).toBe(false)
    if (invalidQuery.ok) return
    expect(invalidQuery.checks?.some(check => check.message.includes('includeMembers'))).toBe(true)
    expect(invalidQuery.checks?.some(check => check.message.includes('kind'))).toBe(true)
    expect(invalidQuery.checks?.some(check => check.message.includes('旧字段 member'))).toBe(true)
    expect(invalidQuery.checks?.some(check => check.message.includes('openPageDesign'))).toBe(false)
  })

  it('rejects old script argument aliases in recovery guidance', () => {
    const invalidScript = enrichFunctionCallResult({
      protocolToolName: CLASS_MODEL_TOOL_NAMES.script,
      args: { code: 'return 1' },
      callResult: {
        ok: false,
        code: 'INVALID_CLASS_MODEL_TOOL_ARGS',
        msg: 'script required',
        fix: 'use schema',
      },
    })

    expect(invalidScript.ok).toBe(false)
    if (invalidScript.ok) return
    expect(invalidScript.checks?.some(check => check.message.includes('只接受 script 字段'))).toBe(true)
    expect(invalidScript.checks?.some(check => check.message.includes('旧字段 code'))).toBe(true)
  })
})
