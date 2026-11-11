import {afterEach, describe, expect, it} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {abandonRuleDeletion, retryRuleDeletionReadback, settleRuleDeletion, stageRuleDeletion, submitRuleDeletion,
  verifyRuleDeletion} from '@/views/features/data-platform/structured-config/dimension-definition/ui/dimension-rule-deletion'
import {createDimensionRuntime, seedDimensionRule} from './dimension.fixture'

const runtimes: PageRuntime[] = []
afterEach(() => runtimes.splice(0).forEach(runtime => runtime.dispose()))

async function prepare() {
  const f = await createDimensionRuntime()
  runtimes.push(f.runtime)
  await seedDimensionRule(f)
  const state = await stageRuleDeletion({rule: f.rule, children: [f.condition, f.result], id: 'R1'})
  return {...f, state}
}

describe('维度规则删除回执', () => {
  it('按子项、规则顺序提交，并精确回读确认删除', async () => {
    const f = await prepare()
    await submitRuleDeletion(f.state)
    expect(f.state.phase).toBe('done')
    expect(f.state.message).toBe('规则已删除并回读确认')
    expect(f.http.saves.map(item => item.table)).toEqual([
      'Bil_Dimension_Rule_Condition', 'Bil_Dimension_Rule_Result', 'Bil_Dimension_Rule',
    ])
    expect(f.rule.rows).toHaveLength(0)
    expect(f.condition.rows).toHaveLength(0)
    expect(f.result.rows).toHaveLength(0)
  })

  it('子项回执中断后只核验原阶段，用户明确继续后才删除规则', async () => {
    const f = await prepare()
    f.http.failAfterWrite = true
    await submitRuleDeletion(f.state)
    expect(f.state.phase).toBe('verify')
    expect(f.http.saves).toHaveLength(2)
    expect(f.http.records['Bil_Dimension_Rule']).toHaveLength(1)
    await verifyRuleDeletion(f.state)
    expect(f.state.phase).toBe('continue')
    expect(f.http.saves).toHaveLength(2)
    expect(f.http.records['Bil_Dimension_Rule']).toHaveLength(1)
    await submitRuleDeletion(f.state)
    expect(f.state.phase).toBe('done')
    expect(f.http.saves).toHaveLength(3)
    expect(f.http.records['Bil_Dimension_Rule']).toHaveLength(0)
  })

  it('证明原删除未生效前不重发，证明后才可显式继续', async () => {
    const f = await prepare()
    let interrupted = true
    f.http.beforeSave = async () => {if (interrupted) {interrupted = false; throw new Error('派发后连接中断')}}
    await submitRuleDeletion(f.state)
    expect(f.state.phase).toBe('verify')
    await verifyRuleDeletion(f.state)
    expect(f.state.phase).toBe('continue')
    expect(f.state.message).toContain('原删除未生效')
    expect(f.http.saves).toHaveLength(0)
    await submitRuleDeletion(f.state)
    expect(f.state.phase).toBe('done')
    expect(f.http.saves).toHaveLength(3)
  })

  it('规则阶段回执中断后只核验该阶段，不重复删除子项', async () => {
    const f = await prepare()
    let requests = 0
    f.http.beforeSave = async () => {if (++requests === 2) f.http.failAfterWrite = true}
    await submitRuleDeletion(f.state)
    expect(f.state.phase).toBe('verify')
    expect(f.http.saves).toHaveLength(3)
    expect(f.http.records['Bil_Dimension_Rule']).toHaveLength(0)
    await verifyRuleDeletion(f.state)
    expect(f.state.phase).toBe('done')
    expect(f.http.saves).toHaveLength(3)
  })

  it('规则阶段未生效后显式继续只删除剩余规则', async () => {
    const f = await prepare()
    let requests = 0
    f.http.beforeSave = async () => {if (++requests === 2) throw new Error('派发后连接中断')}
    await submitRuleDeletion(f.state)
    expect(f.state.phase).toBe('verify')
    expect(f.http.saves).toHaveLength(2)
    await verifyRuleDeletion(f.state)
    expect(f.state.phase).toBe('continue')
    await submitRuleDeletion(f.state)
    expect(f.state.phase).toBe('done')
    expect(f.http.saves.map(item => item.table)).toEqual([
      'Bil_Dimension_Rule_Condition', 'Bil_Dimension_Rule_Result', 'Bil_Dimension_Rule',
    ])
  })

  it('子项已删除而规则被拒绝时，放弃剩余本地修改并如实回读', async () => {
    const f = await prepare()
    f.http.beforeSave = async () => {f.http.rejectNextSave = true}
    await submitRuleDeletion(f.state)
    expect(f.state.phase).toBe('settle')
    expect(f.http.records['Bil_Dimension_Rule']).toHaveLength(1)
    expect(f.http.records['Bil_Dimension_Rule_Condition']).toHaveLength(0)
    expect(f.http.records['Bil_Dimension_Rule_Result']).toHaveLength(0)
    await settleRuleDeletion(f.state)
    expect(f.state.phase).toBe('done')
    expect(f.state.message).toContain('请核对规则 R1 的实际结果')
    expect(f.rule.rows).toHaveLength(1)
    expect(f.condition.rows).toHaveLength(0)
    expect(f.result.rows).toHaveLength(0)
  })

  it('子项批次部分生效时保留未知捕获，明确放弃后回读', async () => {
    const f = await prepare()
    f.http.failAfterWrite = true
    await submitRuleDeletion(f.state)
    f.http.records['Bil_Dimension_Rule_Condition'] = [{rowid: 'COND1', rule_id: 'R1', result_id: 'RESULT1',
      account_set_id: 'GLOBAL', sort_no: 1, field_code: 'kind', operator: 'equal', value_source: 'CONST', compare_value: 'x'}]
    await verifyRuleDeletion(f.state)
    expect(f.state.phase).toBe('verify')
    expect(f.state.message).toContain('部分生效')
    expect(f.http.saves).toHaveLength(2)
    await abandonRuleDeletion(f.state)
    expect(f.state.phase).toBe('done')
    expect(f.rule.rows).toHaveLength(1)
    expect(f.condition.rows).toHaveLength(1)
    expect(f.result.rows).toHaveLength(0)
    expect(f.http.saves).toHaveLength(2)
  })

  it('已有其他待处理修改时不接管或覆盖', async () => {
    const f = await createDimensionRuntime()
    runtimes.push(f.runtime)
    await seedDimensionRule(f)
    f.rule.updateEditingValue('R1', 'rule_name', '其他编辑')
    await expect(stageRuleDeletion({rule: f.rule, children: [f.condition, f.result], id: 'R1'})).rejects.toThrow('必须先保存或明确放弃')
    expect(f.rule.getEditingRow('R1')?.['rule_name']).toBe('其他编辑')
    expect(f.condition.rows).toHaveLength(1)
    expect(f.http.saves).toHaveLength(0)
  })

  it('删除已确认后回读失败时只重试回读，不重发删除', async () => {
    const f = await prepare()
    let requests = 0, fail = true
    f.http.beforeSave = async () => {
      requests++
      if (requests === 2) f.http.beforeDefinitionRead = async () => {if (fail) throw new Error('回读断连')}
    }
    await submitRuleDeletion(f.state)
    expect(f.state.phase).toBe('reload')
    expect(f.state.message).toContain('删除已提交，但回读失败')
    expect(f.http.saves).toHaveLength(3)
    fail = false
    await retryRuleDeletionReadback(f.state)
    expect(f.state.phase).toBe('done')
    expect(f.http.saves).toHaveLength(3)
  })
})
