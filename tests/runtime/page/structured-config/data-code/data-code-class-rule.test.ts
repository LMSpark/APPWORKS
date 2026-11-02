import {afterEach, describe, expect, it, vi} from 'vitest'
import {config, flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus, {ElSelect} from 'element-plus'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {RequestState} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, Spark, FieldSelect, FieldText, RendererButton, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import CodeClassSelectorDialog from '@/views/features/data-platform/structured-config/data-code/ui/code-class-selector-dialog.vue'
import {codeModels, codeService, designText, DESIGN} from './data-code.fixture'
import * as CodeDesignOps from '@/lowcode/resources/structured-config/data-code/design-ops'
import {createSourceDataSet, sourceRecords, SOURCE_SCENE} from './source-picker/fixture'

const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = [], original = {...config.global.stubs}
afterEach(() => {wrappers.splice(0).forEach(w => w.unmount()); runtimes.splice(0).forEach(r => r.dispose()); config.global.stubs = original})
async function fixture(denyDelete = false, withSources = false) {
  const service = codeService()
  if (denyDelete) service.http.denyDelete.add('Base_CodeClassTable')
  service.http.records['Base_CodeNodeDesign']![0] = {rowid: 'N1', CodeDesignID: 'C1', NodeNo: 1, NodeType: 1,
    ParameterName: '原分类', CodeNodeDesignJson: '{"keep":false}'}
  service.http.records['Dict_CodeNodeType']!.push({rowid: 'D1', val: '1', txt: '分类字符串', ordIdx: '1'})
  service.http.records['Base_CodeClassTable'] = [{rowid: 'K1', Name: '订单分类', TableRowid: 'T2', TableName: '分类表',
    TextFieldName: 'code', ValueFieldName: 'id', BusFilterField: 'class_id', BusTableName: '订单', description: '原说明'}]
  service.http.records['Base_TblField'] = [{rowid: 'F1', tblid: 'T1', enname: 'class_id', cnname: '分类ID'},
    {rowid: 'F2', tblid: 'T2', enname: 'code', cnname: '分类编码'}, {rowid: 'F3', tblid: 'T2', enname: 'id', cnname: '分类主键'}]
  if (withSources) {
    const {Base_TblField: _fields, ...records} = sourceRecords()
    Object.assign(service.http.records, records)
  }
  const ds = new LowcodeDataSpaceAssembler(service.runtime, service.http).assemble({config: new ScenarioViewConfig(DESIGN, designText),
    space: {dataSpaceId: DESIGN, name: '编码'}, models: codeModels(), relations: []}).dataSet
  const runtime = new PageRuntime({pageId: 'class-rule', scenarioIds: [DESIGN, SOURCE_SCENE], deferredScenarioIds: [SOURCE_SCENE],
    scenarioInputs: {[DESIGN]: {applicationId: 'A', codeDesignId: 'C1'}}, loadScenario: async id => {
      if (id === DESIGN) return ds
      if (id === SOURCE_SCENE && withSources) return createSourceDataSet(service.http)
      throw new Error('unexpected source loading')
    }})
  await runtime.load(); runtimes.push(runtime); ds.triggerAutoLoad()
  const nodes = ds.getView('Base_CodeNodeDesign')!, catalog = ds.getView('Base_CodeClassTable')!, main = ds.getView('Base_CodeDesign')!
  await vi.waitFor(() => expect(nodes.requestState).toBe(RequestState.Loaded))
  main.updateEditingValue('C1', 'Name', '未保存主设计')
  expect(service.http.reads.some(read => read.table === 'Base_CodeClassTable')).toBe(false)
  registerAllRenderers()
  const stubs = {...original}; for (const name of ['SparkComponentRenderer', 'spark-component-renderer', 'el-table', 'el-table-column']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(defineComponent({setup() {
    const {sparkProvide} = useSparkComponent({type: 'class-rule-host'}); sparkProvide(PAGE_RUNTIME, runtime)
    return () => h(CodeClassSelectorDialog, {dataViewKey: `${DESIGN}@Base_CodeNodeDesign@default`, nodeId: 'N1'})
  }}), {attachTo: document.body, global: {plugins: [ElementPlus, Spark.createPlugin()]}})
  wrappers.push(wrapper); await flushPromises()
  const dialog = wrapper.getComponent(CodeClassSelectorDialog)
  const click = async (label: string, confirmDelete = true) => {
    const button = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === label)
    expect(button, `missing ${label}`).toBeDefined()
    await button!.get('button').trigger('click'); await flushPromises()
    if (label === '删除' && confirmDelete) {
      const confirmation = wrapper.findAllComponents(RendererButton).find(item => item.props('label') === '确定删除')
      if (confirmation) {await confirmation.get('button').trigger('click'); await flushPromises()}
    }
  }
  return {wrapper, dialog, nodes, main, catalog, service, click, ds, runtime}
}

describe('classification selection through original views', () => {
  it('cancels the reference picker without modifying the stored mapping and rejects confirmation after the parent business target changes', async () => {
    const f = await fixture(false, true)
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); await flushPromises(); await f.click('编辑')
    await vi.waitFor(() => expect(f.wrapper.findAllComponents(RendererButton).some(item => item.props('label') === '设置引用表')).toBe(true))
    await f.click('设置引用表')
    await vi.waitFor(() => expect(f.runtime.resolveView(`${SOURCE_SCENE}@Base_AppSystemList@default`)?.requestState).toBe(RequestState.Loaded))
    await f.click('取消选择引用表')
    expect(f.catalog.hasEditingChanges()).toBe(false)
    await f.click('设置引用表')
    await flushPromises()
    f.main.updateEditingValue('C1', 'BusTableRowid', 'OTHER'); await flushPromises()
    await f.click('确定引用表')
    expect(document.body.textContent).toContain('业务表目标已改变')
    expect(f.catalog.hasEditingChanges()).toBe(false)
    expect(f.service.http.saves).toEqual([])
  })
  it('loads reference sources only on demand, applies selected physical fields and restores the entire mapping on parent cancel', async () => {
    const f = await fixture(false, true)
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    expect(f.runtime.resolveView(`${SOURCE_SCENE}@Base_AppSystemList@default`)).toBeUndefined()
    f.catalog.setCurrentRowById('K1'); await flushPromises(); await f.click('编辑')
    await vi.waitFor(() => expect(f.wrapper.findAllComponents(RendererButton).some(item => item.props('label') === '设置引用表')).toBe(true))
    await f.click('设置引用表')
    const sourceView = (model: string, view = 'default') => f.runtime.resolveView(`${SOURCE_SCENE}@${model}@${view}`)!
    await vi.waitFor(() => expect(sourceView('Base_AppSystemList')?.requestState).toBe(RequestState.Loaded))
    const choose = (model: string, id: string, viewId = 'default') => {
      const view = sourceView(model, viewId); view.setCurrentRowById(id); view.setSelectedRows([view.currentRow!])
    }
    choose('Base_AppSystemList', 'A1')
    await vi.waitFor(() => expect(sourceView('Base_AppAndSource_Relation').rows).toHaveLength(1)); choose('Base_AppAndSource_Relation', 'R1')
    await vi.waitFor(() => expect(sourceView('_Base_TblList').rows).toHaveLength(2)); choose('_Base_TblList', 'T1')
    await vi.waitFor(() => expect(sourceView('Base_TblField', 'textFields').rows).toHaveLength(1))
    choose('Base_TblField', 'F1', 'textFields'); choose('Base_TblField', 'F1', 'valueFields'); await flushPromises()
    await f.click('确定引用表')
    await vi.waitFor(() => expect(f.ds.getView('Base_TblField', 'referenceFields')!.queryContext['referenceTableRowid']).toBe('T1'))
    expect(f.catalog.getEditingRow('K1')).toMatchObject({TableRowid: 'T1', TableName: 'table_one', TextFieldName: 'class_id', ValueFieldName: 'class_id'})
    expect(f.service.http.saves).toEqual([])
    await vi.waitFor(() => expect(f.wrapper.findAllComponents(RendererButton).find(item => item.props('label') === '取消编辑')!.props('disabled')).toBe(false))
    await f.click('取消编辑')
    expect(f.catalog.getEditingRow('K1') ?? f.catalog.currentRow).toMatchObject({TableRowid: 'T2', TableName: '分类表', TextFieldName: 'code', ValueFieldName: 'id', description: '原说明'})
    expect(f.service.http.saves).toEqual([])
    expect(f.main.hasEditingChanges()).toBe(true)
  })
  it('requires deletion confirmation and leaves every draft unchanged when the confirmation is cancelled', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); await flushPromises(); await f.click('删除', false)
    expect(f.catalog.dirtyTracking.pendingDeleteIds.size).toBe(0)
    expect(document.body.textContent).toContain('删除确认')
    await f.click('取消删除')
    expect(f.catalog.hasEditingChanges()).toBe(false)
    expect(f.catalog.rows).toHaveLength(1)
    expect(f.main.hasEditingChanges()).toBe(true)
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.service.http.saves).toEqual([])
  })
  it('stages deletion in the original directory and restores it on explicit discard', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); await flushPromises(); await f.click('删除')
    expect(f.catalog.dirtyTracking.pendingDeleteIds.has('K1')).toBe(true)
    expect(f.service.http.saves).toEqual([])
    await f.click('放弃目录修改')
    expect(f.catalog.rows.some(row => row['rowid'] === 'K1')).toBe(true)
    expect(f.catalog.dirtyTracking.pendingDeleteIds.size).toBe(0)
    expect(f.main.hasEditingChanges()).toBe(true)
    expect(f.nodes.hasEditingChanges()).toBe(false)
  })
  it('saves only the selected directory deletion without deleting or rewriting code node snapshots', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); await flushPromises(); await f.click('删除'); await f.click('保存目录')
    expect(f.service.http.records['Base_CodeClassTable']).toEqual([])
    expect(f.service.http.saves.map(save => save.table)).toEqual(['Base_CodeClassTable'])
    expect(f.service.http.saves[0]?.deleted.map(row => row['rowid'])).toEqual(['K1'])
    expect(f.service.http.records['Base_CodeNodeDesign']![0]?.['CodeNodeDesignJson']).toBe('{"keep":false}')
    expect(f.main.hasEditingChanges()).toBe(true)
  })
  it('consumes the original query delete denial for the selected classification', async () => {
    const f = await fixture(true)
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); await flushPromises()
    const button = f.wrapper.findAllComponents(RendererButton).find(item => item.props('label') === '删除')!
    expect(button.get('button').attributes('disabled')).toBeDefined()
    await button.get('button').trigger('click'); await flushPromises()
    expect(f.catalog.dirtyTracking.pendingDeleteIds.size).toBe(0)
    expect(f.service.http.saves).toEqual([])
  })
  it('verifies an unknown directory deletion without replaying the delete request', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); await flushPromises(); await f.click('删除')
    f.service.http.failAfterWrite = true; await f.click('保存目录')
    expect(f.catalog.hasUnconfirmedSave).toBe(true)
    await f.click('核验目录保存结果')
    expect(f.catalog.hasUnconfirmedSave).toBe(false)
    expect(f.service.http.saves).toHaveLength(1)
    expect(f.service.http.records['Base_CodeClassTable']).toEqual([])
  })
  it('reads the original business table title and description needed by the maintenance form', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    expect(f.catalog.rows[0]?.['BusTableName']).toBe('订单')
    expect(f.catalog.rows[0]?.['description']).toBe('原说明')
  })
  it('edits a bound class title and saves the directory independently through its visible action', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.wrapper.findAll('tbody tr')).toHaveLength(1))
    await f.wrapper.get('tbody tr').trigger('click'); await flushPromises()
    await f.click('编辑')
    const editor = f.wrapper.findComponent({name: 'code-class-edit-dialog'})
    await vi.waitFor(() => expect(editor.findAllComponents(FieldText).some(field => field.props('field') === 'Name')).toBe(true))
    const input = editor.findAllComponents(FieldText).find(field => field.props('field') === 'Name')!.find('input')
    expect(input.exists()).toBe(true)
    await input.setValue('维护后分类'); await input.trigger('change'); await flushPromises()
    expect(f.catalog.getEditingRow('K1')?.['Name']).toBe('维护后分类')
    await f.click('确认编辑')
    await f.click('保存目录')
    expect(f.service.http.records['Base_CodeClassTable']![0]?.['Name']).toBe('维护后分类')
    expect(f.service.http.saves.map(save => save.table)).toEqual(['Base_CodeClassTable'])
    expect(f.main.hasEditingChanges()).toBe(true)
    expect(f.nodes.hasEditingChanges()).toBe(false)
  })
  it('loads business and reference field views for separate exact table identities', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); await flushPromises(); await f.click('编辑')
    const business = f.ds.getView('Base_TblField')!, reference = f.ds.getView('Base_TblField', 'referenceFields')
    expect(reference).toBeDefined()
    await vi.waitFor(() => expect(reference!.requestState).toBe(RequestState.Loaded))
    expect(business.rows.map(row => row['enname'])).toEqual(['class_id'])
    expect(reference!.rows.map(row => row['enname'])).toEqual(['code', 'id'])
    expect(f.service.http.saves).toEqual([])
  })
  it('rejects an old confirmation after the reference option query context changes', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); await flushPromises(); await f.click('编辑')
    const reference = f.ds.getView('Base_TblField', 'referenceFields')!
    await vi.waitFor(() => expect(reference.requestState).toBe(RequestState.Loaded))
    reference.queryContext = {...reference.queryContext, referenceTableRowid: 'OTHER'}
    await f.click('确认编辑')
    expect(f.wrapper.findComponent({name: 'code-class-edit-dialog'}).exists()).toBe(true)
    expect(document.body.textContent).toContain('字段候选查询目标已改变')
    expect(f.service.http.saves).toEqual([])
  })
  it('writes a selected reference field through the standard bound control before independent directory save', async () => {
    const f = await fixture()
    f.service.http.records['Base_TblField']!.push({rowid: 'F4', tblid: 'T2', enname: 'code_alt', cnname: '备用编码'})
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); await flushPromises(); await f.click('编辑')
    const editor = f.wrapper.findComponent({name: 'code-class-edit-dialog'})
    await vi.waitFor(() => expect(editor.findAllComponents(FieldSelect)).toHaveLength(3))
    const field = editor.findAllComponents(FieldSelect).find(item => item.props('field') === 'TextFieldName')!
    field.getComponent(ElSelect).vm.$emit('update:modelValue', 'code_alt'); await flushPromises()
    expect(f.catalog.getEditingRow('K1')?.['TextFieldName']).toBe('code_alt')
    await f.click('确认编辑')
    expect(f.service.http.saves).toEqual([])
    await f.click('保存目录')
    expect(f.service.http.saves.map(save => save.table)).toEqual(['Base_CodeClassTable'])
    expect(f.service.http.records['Base_CodeClassTable']![0]?.['TextFieldName']).toBe('code_alt')
    expect(f.nodes.hasEditingChanges()).toBe(false)
  })
  it('cancels the editor using its original field checkpoint, preserving earlier directory and main drafts', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.updateEditingValue('K1', 'description', '先前目录修改'); f.catalog.setCurrentRowById('K1')
    await flushPromises(); await f.click('编辑')
    const editor = f.wrapper.findComponent({name: 'code-class-edit-dialog'})
    await vi.waitFor(() => expect(editor.findAllComponents(FieldText).some(field => field.props('field') === 'Name')).toBe(true))
    f.catalog.updateEditingValue('K1', 'Name', '取消此名称')
    const cancel = editor.findAllComponents(RendererButton).find(button => button.props('label') === '取消编辑')!
    await cancel.get('button').trigger('click'); await flushPromises()
    expect(f.catalog.getEditingRow('K1')?.['Name']).toBe('订单分类')
    expect(f.catalog.getEditingRow('K1')?.['description']).toBe('先前目录修改')
    expect(f.main.hasEditingChanges()).toBe(true)
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.service.http.saves).toEqual([])
  })
  it('keeps pending directory edits until explicitly discarded without changing node or main edits', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.updateEditingValue('K1', 'description', '未保存说明'); await flushPromises(); await f.click('取消')
    expect(f.dialog.emitted('close')).toBeUndefined()
    await f.click('放弃目录修改')
    expect(f.catalog.hasEditingChanges()).toBe(false)
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.main.hasEditingChanges()).toBe(true)
    await f.click('取消')
    expect(f.dialog.emitted('close')).toHaveLength(1)
    expect(f.service.http.saves).toEqual([])
  })
  it('offers verification after an unknown visible directory save without submitting it twice', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.updateEditingValue('K1', 'description', '目录新说明'); f.service.http.failAfterWrite = true
    await flushPromises(); await f.click('保存目录')
    expect(f.catalog.hasUnconfirmedSave).toBe(true)
    expect(f.wrapper.findAll('button').find(button => button.text() === '取消')?.attributes('disabled')).toBeDefined()
    await f.click('核验目录保存结果')
    expect(f.catalog.hasUnconfirmedSave).toBe(false)
    expect(f.service.http.saves).toHaveLength(1)
    expect(f.main.hasEditingChanges()).toBe(true)
  })
  it('saves only modified class records, preserving pending main and node edits', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.nodes.updateEditingValue('N1', 'ParameterName', '未保存节点')
    f.catalog.updateEditingValue('K1', 'Name', '新分类')
    expect((await CodeDesignOps.saveCodeClasses(f.ds)).success).toBe(true)
    expect(f.service.http.saves.map(save => save.table)).toEqual(['Base_CodeClassTable'])
    expect(f.service.http.records['Base_CodeClassTable']![0]).toMatchObject({Name: '新分类', BusTableName: '订单', description: '原说明'})
    expect(f.nodes.hasEditingChanges()).toBe(true)
    expect(f.main.hasEditingChanges()).toBe(true)
  })
  it('retains invalid directory edits and issues no writes', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.updateEditingValue('K1', 'BusTableName', '')
    await expect(CodeDesignOps.saveCodeClasses(f.ds)).rejects.toThrow('业务表名不能为空')
    expect(f.catalog.hasEditingChanges()).toBe(true)
    expect(f.service.http.saves).toEqual([])
  })
  it('reconciles an unknown directory save using the original view without replaying the write', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.updateEditingValue('K1', 'description', '新说明')
    f.service.http.failAfterWrite = true
    await expect(CodeDesignOps.saveCodeClasses(f.ds)).rejects.toThrow('SPARK_SAVE_UNCONFIRMED')
    expect(f.catalog.hasUnconfirmedSave).toBe(true)
    expect((await CodeDesignOps.saveCodeClasses(f.ds)).success).toBe(true)
    expect(f.catalog.hasUnconfirmedSave).toBe(false)
    expect(f.service.http.saves).toHaveLength(1)
    expect(f.service.http.records['Base_CodeClassTable']![0]?.['description']).toBe('新说明')
    expect(f.main.hasEditingChanges()).toBe(true)
  })
  it('queries lazily, maps formal reference fields and preserves unknown node rule members without saving', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.wrapper.findAll('tbody tr')).toHaveLength(1))
    await f.wrapper.get('tbody tr').trigger('click'); await flushPromises(); await f.click('确定')
    expect(f.nodes.getEditingRow('N1')?.['ParameterName']).toBe('订单分类')
    expect(JSON.parse(String(f.nodes.getEditingRow('N1')?.['CodeNodeDesignJson']))).toEqual({keep: false, BusFilterField: 'class_id', RefTableId: 'T2',
      RefTableName: '分类表', RefTableValueField: 'code', RefTableFilterField: 'id'})
    expect(f.main.getEditingRow('C1')?.['Name']).toBe('未保存主设计')
    expect(f.service.http.saves).toEqual([])
    expect(f.dialog.emitted('close')).toHaveLength(1)
    f.nodes.discardPendingChanges()
    expect(f.nodes.rows[0]?.['CodeNodeDesignJson']).toBe('{"keep":false}')
  })
  it('cancels without changing node or unrelated pending main edits', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); await flushPromises(); await f.click('取消')
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.main.hasEditingChanges()).toBe(true)
    expect(f.service.http.saves).toEqual([])
    expect(f.dialog.emitted('close')).toHaveLength(1)
  })
  it('rejects a stale node target without applying the selected rule', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); f.nodes.setCurrentRow(null); await flushPromises(); await f.click('确定')
    expect(f.wrapper.text()).toContain('编码段目标已改变')
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.dialog.emitted('close')).toBeUndefined()
  })
  it('does not select a directory row with uncommitted edits', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); f.catalog.updateEditingValue('K1', 'Name', '未保存目录'); await flushPromises(); await f.click('确定')
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.dialog.emitted('close')).toBeUndefined()
    expect(f.service.http.saves).toEqual([])
  })
  it('retains invalid existing JSON rather than overwriting it with the selected rule', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1'); f.nodes.updateEditingValue('N1', 'CodeNodeDesignJson', '{invalid'); await flushPromises()
    await f.click('确定')
    expect(f.wrapper.text()).toContain('JSON无效')
    expect(f.nodes.getEditingRow('N1')?.['CodeNodeDesignJson']).toBe('{invalid')
    expect(f.nodes.getEditingRow('N1')?.['ParameterName']).toBe('原分类')
    expect(f.service.http.saves).toEqual([])
  })
  it('restores both original field patches if applying the second mapped field fails', async () => {
    const f = await fixture()
    await vi.waitFor(() => expect(f.catalog.requestState).toBe(RequestState.Loaded))
    f.catalog.setCurrentRowById('K1')
    const originalWrite = f.nodes.updateEditingValue.bind(f.nodes)
    vi.spyOn(f.nodes, 'updateEditingValue').mockImplementation((id, field, value) => {
      if (field === 'ParameterName') throw new Error('写回中断')
      return originalWrite(id, field, value)
    })
    await flushPromises(); await f.click('确定')
    expect(f.wrapper.text()).toContain('写回中断')
    expect(f.nodes.hasEditingChanges()).toBe(false)
    expect(f.dialog.emitted('close')).toBeUndefined()
    expect(f.service.http.saves).toEqual([])
  })
})
