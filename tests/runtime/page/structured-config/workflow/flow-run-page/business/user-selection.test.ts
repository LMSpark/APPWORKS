import {expect, it} from 'vitest'
import {DataSet, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {captureWorkflowUserSelection} from '@/lowcode/resources/system/workflow/manage/flow-run-page/input/user-selection'

it('captures only original candidates, validates counts and expires after a same-value refresh', async () => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}})
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'Candidates', resource: {resourceType: 'logical-view', resourceId: 'candidates'}, columns: [{name: 'id', primary: true}, {name: 'name'}, {name: 'value'}, {name: 'nodeId'}]})
  bindDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'logical-view', resourceId: 'candidates'}, guard: () => {}, loadRows: async () => [{id: 'U', name: '甲', value: 'U:甲', nodeId: 'N'}]})
  try {
    await view.refresh()
    expect(() => captureWorkflowUserSelection({view, input: [], min: 1, max: 2, label: '追加办理'})).toThrow(/少于/)
    expect(() => captureWorkflowUserSelection({view, input: ['U:甲'], min: 0, max: 0, label: '追加办理'})).toThrow(/超过/)
    expect(() => captureWorkflowUserSelection({view, input: ['U:伪名'], min: 1, max: 2, label: '追加办理'})).toThrow(/候选/)
    expect(() => captureWorkflowUserSelection({view, input: ['U:甲', 'U:甲'], min: 1, max: 2, label: '追加办理'})).toThrow(/重复/)
    const selected = captureWorkflowUserSelection({view, input: ['U:甲'], min: 1, max: 2, label: '追加办理'})
    selected.assertCurrent(); expect(selected.values).toEqual(['U:甲'])
    await view.refresh(); expect(() => selected.assertCurrent()).toThrow()
  } finally {ds.destroy()}
})
