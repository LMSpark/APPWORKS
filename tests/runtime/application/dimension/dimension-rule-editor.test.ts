import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h, ref} from 'vue'
import ElementPlus from 'element-plus'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FieldSelect, FieldText, PAGE_RUNTIME, PAGE_SERVICE, RendererButton, RendererDialog, Spark, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {createTestPageService} from '../../../support/helpers/page-service-host'
import DimensionRuleEditor from '@/views/features/data-platform/structured-config/dimension-definition/ui/dimension-rule-editor.vue'
import {createDimensionRuntime, keys, seedDimensionRule} from './dimension.fixture'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = []
beforeEach(() => {
  registerAllRenderers()
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  runtimes.splice(0).forEach(runtime => runtime.dispose())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function open(existing = false, anchorMetadata = true) {
  const f = await createDimensionRuntime('R1', anchorMetadata)
  runtimes.push(f.runtime)
  if (existing) {
    await seedDimensionRule(f)
  } else {
    await f.rule.addRowWithIdentity({field: 'rowid', value: 'R1'}, {rule_code: 'new-rule', rule_name: '新规则', event_code: 'expense',
      biz_category: 'finance', account_set_id: 'GLOBAL', priority: 0, voucher_required: false, auto_voucher_write: false,
      stop_after_match: false, status: false})
  }
  const closed = vi.fn(), boundId = ref('R1')
  const Host = defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'dimension-rule-test'})
    sparkProvide(PAGE_RUNTIME, f.runtime)
    sparkProvide(PAGE_SERVICE, createTestPageService())
    return () => h(DimensionRuleEditor, {ruleKey: keys.rule, conditionKey: keys.condition, resultKey: keys.result,
      eventKey: keys.event, bindingKey: keys.validationBinding, ruleId: boundId.value, created: !existing, onClose: closed})
  }})
  const wrapper = mount(Host, {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper)
  await flushPromises()
  const button = (label: string) => {
    const found = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === label)
    if (!found) throw new Error(`按钮不存在: ${label}`)
    return found
  }
  const click = async (label: string) => {
    await button(label).get('button').trigger('click')
    await flushPromises()
  }
  const addResult = async () => {
    await click('添加结果')
    const row = f.result.rows.at(-1), id = row && f.result.getPkKey(row)
    if (id === undefined) throw new Error('结果未新增')
    for (const [field, value] of Object.entries({dim_category: 'finance', dim_code: 'cost', value_expr: 'item.code'})) {
      f.result.updateEditingValue(id, field, value)
    }
    await flushPromises()
    return id
  }
  const addCondition = async (resultId: string | number) => {
    await click('添加条件')
    const row = f.condition.rows.at(-1), id = row && f.condition.getPkKey(row)
    if (id === undefined) throw new Error('条件未新增')
    for (const [field, value] of Object.entries({result_id: resultId, field_code: 'kind', compare_value: 'x'})) {
      f.condition.updateEditingValue(id, field, value)
    }
    await flushPromises()
    return id
  }
  return {...f, wrapper, button, click, addResult, addCondition, closed, boundId}
}

async function confirm(label: string): Promise<void> {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.el-message-box__btns button')).reverse()
    .find(item => item.textContent?.trim() === label)
  if (!button) throw new Error(`确认框按钮不存在: ${label}`)
  button.click()
  await flushPromises()
}

function anchor(changes: Record<string, unknown> = {}) {
  return {id: 'B1', binding_code: 'anchor', source_application_id: 'APP', source_node_id: 'NODE',
    source_kind: 'data-model', source_model_id: 'MODEL', source_model_meta_name: 'Expense', source_contract_id: null,
    event_code: 'expense', payload_version: 1, binding_version: 1, effective_from: null, effective_to: null, status: 1, ...changes}
}

describe('维度规则整组编辑', () => {
  it('停用草稿也必须有结果', async () => {
    const f = await open()
    await f.click('保存规则')
    expect(document.body.textContent).toContain('规则须至少配置一条结果')
    expect(f.http.saves).toHaveLength(0)
    expect(f.closed).not.toHaveBeenCalled()
  })

  it('停用草稿保留未填写的条件和可选表达式', async () => {
    const f = await open()
    const resultId = await f.addResult(), conditionId = await f.addCondition(resultId)
    f.result.updateEditingValue(resultId, 'amount_type', 'FIELD')
    f.result.updateEditingValue(resultId, 'amount_expr', '')
    f.result.updateEditingValue(resultId, 'direction_type', 'FIELD')
    f.result.updateEditingValue(resultId, 'direction_expr', '')
    f.result.updateEditingValue(resultId, 'value_name_type', 'CONST')
    f.result.updateEditingValue(resultId, 'value_name_expr', '')
    f.condition.updateEditingValue(conditionId, 'compare_value', '')
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledWith('规则已保存并回读确认'))
    expect(f.http.records['Bil_Dimension_Rule_Result']).toMatchObject([{amount_type: 'FIELD', amount_expr: '',
      direction_type: 'FIELD', direction_expr: '', value_name_type: 'CONST', value_name_expr: ''}])
    expect(f.http.records['Bil_Dimension_Rule_Condition']).toMatchObject([{compare_value: ''}])
  })

  it('启用规则必须填写已选类型对应的表达式', async () => {
    const f = await open()
    const resultId = await f.addResult()
    f.result.updateEditingValue(resultId, 'amount_type', 'FIELD')
    f.result.updateEditingValue(resultId, 'amount_expr', '')
    f.rule.updateEditingValue('R1', 'status', true)
    await f.click('保存规则')
    expect(document.body.textContent).toContain('结果 1请填写金额表达式')
    expect(f.http.saves).toHaveLength(0)
  })

  it('规则结果在根事实时也能配置来源行身份', async () => {
    const f = await open()
    const resultId = await f.addResult()
    const type = f.wrapper.findAllComponents(FieldSelect).find(item => item.props('field') === 'source_id_type')
    const expression = f.wrapper.findAllComponents(FieldText).find(item => item.props('field') === 'source_id_expr')
    if (!type || !expression) throw new Error('根事实结果缺少来源行身份字段')
    expect(type.props('clearable')).toBe(true)
    expect(expression.props('readonly')).toBe(true)
    f.result.updateEditingValue(resultId, 'source_id_type', 'FIELD')
    f.result.updateEditingValue(resultId, 'source_id_expr', 'root.id')
    await flushPromises()
    expect(expression.props('readonly')).toBe(false)
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledWith('规则已保存并回读确认'))
    expect(f.http.records['Bil_Dimension_Rule_Result']).toMatchObject([{source_id_type: 'FIELD', source_id_expr: 'root.id'}])
  })

  it('停用规则的历史事件已不在列表时仍可保存草稿', async () => {
    const f = await open(true)
    f.http.records['Bil_Dimension_Rule_Template'] = []
    await f.events.refresh()
    f.rule.updateEditingValue('R1', 'rule_name', '暂存规则')
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledWith('规则已保存并回读确认'))
    expect(f.http.records['Bil_Dimension_Rule']).toMatchObject([{rule_name: '暂存规则', event_code: 'expense'}])
  })

  it('事件业务分类不可读时不写入被隐藏的值', async () => {
    const f = await open()
    f.http.records['Bil_Dimension_Rule_Template'] = [{rowid: 'E2', event_code: 'other', template_name: '其他事件',
      biz_category: 'hidden-category', status: true}]
    f.http.hiddenFields['Bil_Dimension_Rule_Template'] = ['biz_category']
    await f.events.refresh()
    f.rule.updateEditingValue('R1', 'event_code', 'other')
    await flushPromises()
    expect(f.rule.getEditingRow('R1')?.['biz_category']).toBe('finance')
    expect(document.body.textContent).toContain('事件合同字段不可读取，不能确定业务分类')
  })

  it('按参考合同补齐历史结果缺省的编码和金额类型', async () => {
    const f = await open(true)
    const stored = f.http.records['Bil_Dimension_Rule_Result']?.[0]
    if (!stored) throw new Error('缺少历史规则结果')
    stored['dim_code_type'] = ''
    stored['amount_type'] = ''
    await f.result.refresh()
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledWith('规则已保存并回读确认'))
    expect(f.http.records['Bil_Dimension_Rule_Result']).toMatchObject([{dim_code_type: 'CONST', amount_type: 'NONE'}])
  })

  it('草稿也拒绝无效的条件运算符', async () => {
    const f = await open()
    const resultId = await f.addResult(), conditionId = await f.addCondition(resultId)
    f.condition.updateEditingValue(conditionId, 'operator', 'invalid')
    await f.click('保存规则')
    expect(document.body.textContent).toContain('条件 1运算符无效')
    expect(f.http.saves).toHaveLength(0)
  })

  it.each(['__proto__[]', 'details[].prototype[]', 'constructor[]'])('拒绝不安全的集合路径 %s', async path => {
    const f = await open()
    const resultId = await f.addResult()
    f.result.updateEditingValue(resultId, 'collection_path', path)
    f.result.updateEditingValue(resultId, 'source_id_type', 'FIELD')
    f.result.updateEditingValue(resultId, 'source_id_expr', 'item.id')
    await f.click('保存规则')
    expect(document.body.textContent).toContain('集合路径须使用安全的')
    expect(f.http.saves).toHaveLength(0)
  })

  it('同批提交规则、条件和结果，并按正式身份回读', async () => {
    const f = await open()
    const resultId = await f.addResult()
    const conditionId = await f.addCondition(resultId)
    f.rule.updateEditingValue('R1', 'account_set_id', 'SET-A')
    let requests = 0
    f.http.beforeSave = async () => {requests++}
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledWith('规则已保存并回读确认'))
    expect(requests).toBe(1)
    expect(f.http.saves).toHaveLength(3)
    expect(f.http.records['Bil_Dimension_Rule']).toMatchObject([{rowid: 'R1', account_set_id: 'SET-A'}])
    expect(f.http.records['Bil_Dimension_Rule_Result']).toMatchObject([{rowid: resultId, rule_id: 'R1', account_set_id: 'SET-A'}])
    expect(f.http.records['Bil_Dimension_Rule_Condition']).toMatchObject([{rowid: conditionId, result_id: resultId, account_set_id: 'SET-A'}])
  })

  it('条件的结果选项区分相同编码并跟随未保存的结果编辑', async () => {
    const f = await open()
    const firstId = await f.addResult()
    const secondId = await f.addResult()
    f.result.updateEditingValue(secondId, 'dim_category', 'operations')
    const conditionId = await f.addCondition(firstId)
    const select = f.wrapper.findAllComponents(FieldSelect).find(item => item.props('field') === 'result_id')
    if (!select) throw new Error('结果字段未绑定标准选项组件')
    expect(select.text()).toContain(`finance / cost / ${firstId}`)
    f.condition.updateEditingValue(conditionId, 'result_id', secondId)
    await flushPromises()
    expect(select.text()).toContain(`operations / cost / ${secondId}`)
    f.result.updateEditingValue(secondId, 'dim_code', 'updated-cost')
    await flushPromises()
    expect(select.text()).toContain(`operations / updated-cost / ${secondId}`)
  })

  it('条件引用结果时禁止删除，调整条件后可删除', async () => {
    const f = await open(true)
    await f.click('删除结果')
    expect(document.body.textContent).toContain('该结果仍被条件引用')
    expect(f.result.rows).toHaveLength(1)
    await f.click('删除条件')
    await f.click('删除结果')
    expect(f.condition.rows).toHaveLength(0)
    expect(f.result.rows).toHaveLength(0)
    await f.click('取消')
    expect(f.condition.rows).toHaveLength(1)
    expect(f.result.rows).toHaveLength(1)
    expect(f.http.saves).toHaveLength(0)
  })

  it('增删子项后按当前顺序保存连续序号', async () => {
    const f = await open(true)
    const resultId = await f.addResult()
    await f.click('删除条件')
    await f.click('删除结果')
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledWith('规则已保存并回读确认'))
    expect(f.http.records['Bil_Dimension_Rule_Condition']).toHaveLength(0)
    expect(f.http.records['Bil_Dimension_Rule_Result']).toMatchObject([{rowid: resultId, sort_no: 1}])
  })

  it('取消只恢复本次新增、删除和编辑覆盖', async () => {
    const f = await open(true)
    f.rule.updateEditingValue('R1', 'rule_name', '未保存')
    await f.click('删除条件')
    await f.addResult()
    await f.click('取消')
    expect(f.closed).toHaveBeenCalledOnce()
    expect(f.rule.getEditingRow('R1')?.['rule_name']).toBe('原规则')
    expect(f.condition.rows).toHaveLength(1)
    expect(f.result.rows).toHaveLength(1)
    expect(f.http.saves).toHaveLength(0)
  })

  it('缺少正式锚点完整身份时明确阻止启用', async () => {
    const f = await open(false, false)
    await f.addResult()
    f.http.records['Bil_Dimension_Source_Binding'] = [{id: 'B1', event_code: 'expense', status: 1}]
    await f.bindings.refresh()
    f.rule.updateEditingValue('R1', 'status', true)
    await f.click('保存规则')
    expect(document.body.textContent).toContain('无法完整读取正式来源锚点')
    expect(f.http.saves).toHaveLength(0)
  })

  it.each(['data-model', 'platform-event'])('正式 %s 锚点完整且有效时允许启用', async kind => {
    const f = await open()
    await f.addResult()
    f.http.records['Bil_Dimension_Source_Binding'] = [anchor({source_kind: kind,
      source_model_id: kind === 'data-model' ? 'MODEL' : null, source_model_meta_name: kind === 'data-model' ? 'Expense' : null,
      source_contract_id: kind === 'platform-event' ? 'CONTRACT' : null})]
    f.rule.updateEditingValue('R1', 'status', true)
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledWith('规则已保存并回读确认'))
    expect(f.http.records['Bil_Dimension_Rule']).toMatchObject([{rowid: 'R1', status: true}])
  })

  it.each([
    ['来源模型身份缺失', {source_model_id: null}],
    ['来源版本无效', {binding_version: 0}],
    ['尚未生效', {effective_from: '2999-01-01T00:00:00Z'}],
    ['已经失效', {effective_to: '2000-01-01T00:00:00Z'}],
  ])('%s 的锚点不能用于启用规则', async (_label, changes) => {
    const f = await open()
    await f.addResult()
    f.http.records['Bil_Dimension_Source_Binding'] = [anchor(changes)]
    f.rule.updateEditingValue('R1', 'status', true)
    await f.click('保存规则')
    expect(document.body.textContent).toContain('身份完整且在有效期内的已启用来源锚点')
    expect(f.http.saves).toHaveLength(0)
  })

  it('来源锚点身份不可读时不能启用', async () => {
    const f = await open()
    await f.addResult()
    f.http.records['Bil_Dimension_Source_Binding'] = [anchor()]
    f.http.hiddenFields['Bil_Dimension_Source_Binding'] = ['source_model_id']
    f.rule.updateEditingValue('R1', 'status', true)
    await f.click('保存规则')
    expect(document.body.textContent).toContain('无法完整读取正式来源锚点')
    expect(f.http.saves).toHaveLength(0)
  })

  it('锚点查询期间编辑身份切换时不提交旧规则', async () => {
    const f = await open()
    await f.addResult()
    f.http.records['Bil_Dimension_Source_Binding'] = [anchor()]
    let release = () => {}, started = false
    const held = new Promise<void>(resolve => {release = resolve})
    f.http.beforeDefinitionRead = async table => {
      if (table === 'Bil_Dimension_Source_Binding') {started = true; await held}
    }
    f.rule.updateEditingValue('R1', 'status', true)
    await f.click('保存规则')
    await vi.waitFor(() => expect(started).toBe(true))
    f.boundId.value = 'R2'
    await flushPromises()
    release()
    await flushPromises()
    expect(f.http.saves).toHaveLength(0)
    expect(f.closed).not.toHaveBeenCalled()
  })

  it('锚点查询期间规则内容变化时不提交未核验的新内容', async () => {
    const f = await open()
    await f.addResult()
    f.http.records['Bil_Dimension_Source_Binding'] = [anchor()]
    let release = () => {}, started = false
    const held = new Promise<void>(resolve => {release = resolve})
    f.http.beforeDefinitionRead = async table => {
      if (table === 'Bil_Dimension_Source_Binding') {started = true; await held}
    }
    f.rule.updateEditingValue('R1', 'status', true)
    await f.click('保存规则')
    await vi.waitFor(() => expect(started).toBe(true))
    f.rule.updateEditingValue('R1', 'event_code', 'other-event')
    release()
    await flushPromises()
    expect(document.body.textContent).toContain('规则或事件合同在核验期间已变化')
    expect(f.http.saves).toHaveLength(0)
  })

  it('回执中断后只核验原批次，不重发', async () => {
    const f = await open()
    await f.addResult()
    f.http.failAfterWrite = true
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.rule.hasUnconfirmedSave).toBe(true))
    expect(f.button('取消').props('disabled')).toBe(true)
    expect(f.wrapper.getComponent(RendererDialog).props('closeDisabled')).toBe(true)
    expect(f.http.saves).toHaveLength(2)
    await f.click('核验原保存结果')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledWith('规则已保存并回读确认'))
    expect(f.http.saves).toHaveLength(2)
  })

  it('确认原批次未生效后，只有显式操作才重新提交', async () => {
    const f = await open()
    await f.addResult()
    let interrupted = true
    f.http.beforeSave = async () => {if (interrupted) {interrupted = false; throw new Error('派发后连接中断')}}
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.rule.hasUnconfirmedSave).toBe(true))
    await f.click('核验原保存结果')
    await vi.waitFor(() => expect(f.rule.hasUnconfirmedSave).toBe(false))
    expect(document.body.textContent).toContain('原提交未生效')
    expect(f.http.saves).toHaveLength(0)
    await f.click('重新保存原修改')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledOnce())
    expect(f.http.saves).toHaveLength(2)
  })

  it('原批次未生效后重试前重新核验锚点，不使用过期条件', async () => {
    const f = await open()
    await f.addResult()
    f.http.records['Bil_Dimension_Source_Binding'] = [anchor()]
    f.rule.updateEditingValue('R1', 'status', true)
    let interrupted = true
    f.http.beforeSave = async () => {if (interrupted) {interrupted = false; throw new Error('派发后连接中断')}}
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.rule.hasUnconfirmedSave).toBe(true))
    await f.click('核验原保存结果')
    await vi.waitFor(() => expect(f.rule.hasUnconfirmedSave).toBe(false))
    f.http.records['Bil_Dimension_Source_Binding'] = [anchor({effective_to: '2000-01-01T00:00:00Z'})]
    await f.click('重新保存原修改')
    expect(document.body.textContent).toContain('身份完整且在有效期内的已启用来源锚点')
    expect(f.http.saves).toHaveLength(0)
    expect(f.closed).not.toHaveBeenCalled()
  })

  it('部分生效时保留未知捕获，明确放弃后回读实际结果', async () => {
    const f = await open()
    await f.addResult()
    f.http.failAfterWrite = true
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.rule.hasUnconfirmedSave).toBe(true))
    f.http.records['Bil_Dimension_Rule_Result'] = []
    await f.click('核验原保存结果')
    expect(document.body.textContent).toContain('部分生效')
    expect(f.rule.hasUnconfirmedSave).toBe(true)
    expect(f.http.saves).toHaveLength(2)
    await f.click('放弃核验并返回')
    await confirm('继续')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledWith(expect.stringContaining('已放弃未保存的本地修改；请核对实际结果：规则 R1')))
    expect(f.http.records['Bil_Dimension_Rule']).toHaveLength(1)
    expect(f.http.records['Bil_Dimension_Rule_Result']).toHaveLength(0)
    expect(f.http.saves).toHaveLength(2)
  })

  it('原提交后出现其他编辑时不放弃捕获', async () => {
    const f = await open()
    await f.addResult()
    f.http.failAfterWrite = true
    await f.click('保存规则')
    await vi.waitFor(() => expect(f.rule.hasUnconfirmedSave).toBe(true))
    f.rule.updateEditingValue('R1', 'rule_name', '后来修改')
    await f.click('放弃核验并返回')
    await confirm('继续')
    expect(document.body.textContent).toContain('还有其他待处理修改')
    expect(f.rule.hasUnconfirmedSave).toBe(true)
    expect(f.closed).not.toHaveBeenCalled()
  })

  it('提交后回读失败时只重试回读，不重发', async () => {
    const f = await open()
    await f.addResult()
    let fail = true
    f.http.beforeSave = async () => {
      f.http.beforeDefinitionRead = async table => {
        if (fail && table === 'Bil_Dimension_Rule_Result') throw new Error('回读断连')
      }
    }
    await f.click('保存规则')
    await vi.waitFor(() => expect(document.body.textContent).toContain('保存已确认，但回读失败'))
    expect(f.http.saves).toHaveLength(2)
    fail = false
    await f.click('重试回读')
    await vi.waitFor(() => expect(f.closed).toHaveBeenCalledOnce())
    expect(f.http.saves).toHaveLength(2)
  })

  it('编辑身份变化后不操作原规则', async () => {
    const f = await open()
    await f.addResult()
    f.boundId.value = 'R2'
    await flushPromises()
    expect(document.body.textContent).toContain('原规则编辑身份已变化')
    await f.click('保存规则')
    expect(f.http.saves).toHaveLength(0)
    expect(f.closed).not.toHaveBeenCalled()
  })
})
