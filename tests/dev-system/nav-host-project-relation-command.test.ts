import {afterEach, describe, expect, it, vi} from 'vitest'
import {SparkData, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {configureNavHostProjectRelation, type NavHostProjectRelationConfig} from '../../src/views/app/dev-system/nav-host-project-picker/nav-host-project-relation-command'

const relationFields = ['prowid', 'pName', 'ValParamName', 'TextParamName', 'childrowid', 'title', 'location',
  'dataSetId', 'DataName', 'DbName', 'selectValParam', 'selectTextParam', 'dataType', 'selectPid', 'paramType'] as const
const datasets: DataSet[] = []
afterEach(() => { datasets.splice(0).forEach(dataSet => dataSet.destroy()) })

function config(overrides: Partial<NavHostProjectRelationConfig> = {}): NavHostProjectRelationConfig {
  return {
    prowid: 'appworks-tool-dev', pName: 'DevSystem', ValParamName: 'projectId', TextParamName: 'projectName',
    childrowid: '', title: '切换项目', location: '', dataSetId: 'DEV-PROJECTS', DataName: 'Base_AppSystemList',
    DbName: '', selectValParam: 'projectId', selectTextParam: 'projectName', dataType: 'Table', selectPid: '',
    paramType: '', ...overrides,
  }
}

async function setup(options: {rows?: DataRow[]; deniedFields?: string[]; addEnabled?: boolean} = {}) {
  let nextIdentity = 0
  const dataSet = SparkData.createDataSet({scenarioId: 'CATALOG', dataSetName: 'Catalog', tables: {
    Base_Navigation_DataRelation: {
      tableName: 'Base_Navigation_DataRelation', modelBinding: {modelId: 'RELATION', modelName: 'Base_Navigation_DataRelation'},
      columns: [{name: 'rowid', type: 'string', isPrimaryKey: true}, ...relationFields.map(name => ({name, type: 'string'}))],
      views: {default: {commitMode: 'staged'}},
    },
  }})
  datasets.push(dataSet)
  const view = dataSet.getView('Base_Navigation_DataRelation')!
  view.commitMode = 'staged'
  view.bindQueryExecutor({executeQuery: async () => ({
    rows: options.rows ?? [], total: options.rows?.length ?? 0, resultPrimaryKey: 'rowid',
    assertIdentity: identity => {
      if (identity.scenarioId !== 'CATALOG' || identity.metaName !== 'Base_Navigation_DataRelation') throw new Error('query identity mismatch')
    },
    rowKey: row => row['rowid'],
    prepareNewRow: row => ({...row, rowid: `relation-${++nextIdentity}`}),
    isFieldReadOnly: field => options.deniedFields?.includes(field) ?? false,
    fieldAccess: (_rowKey, field) => options.deniedFields?.includes(field)
      ? {read: 'visible', write: 'denied', component: 'readonly', required: false, writeMode: 'readonly'}
      : {read: 'visible', write: 'allowed', component: 'editable', required: false, writeMode: 'editable'},
    readFieldAccess: () => 'visible',
    addActionState: available => options.addEnabled === false || available === false ? 'disabled' : 'enabled',
    editActionState: () => 'enabled', deleteActionState: () => 'enabled',
    createChildActionState: () => 'enabled', viewActionState: () => 'enabled',
  })})
  await view.loadFromServer()
  return {dataSet, view}
}

describe('configureNavHostProjectRelation', () => {
  it('stages one reference-compatible project-switch relation through the supplied DataView', async () => {
    const {view} = await setup()
    const created = await configureNavHostProjectRelation(view, 'CATALOG', config())

    expect(created).toMatchObject({rowid: 'relation-1', prowid: 'appworks-tool-dev', pName: 'DevSystem',
      ValParamName: 'projectId', TextParamName: 'projectName', title: '切换项目', dataSetId: 'DEV-PROJECTS',
      DataName: 'Base_AppSystemList', selectValParam: 'projectId', selectTextParam: 'projectName'})
    expect(created).not.toHaveProperty('DbName')
    expect(created).not.toHaveProperty('selectPid')
    expect(created).not.toHaveProperty('paramType')
    expect(view.rows).toEqual([created])
    expect(view.dirtyTracking.pendingCreateIds.has('relation-1')).toBe(true)
    expect(view.newRowFieldAccess('selectTextParam').write).toBe('allowed')
  })

  it.each([
    ['empty navigation identity', {prowid: ' '}],
    ['missing data-space identity', {dataSetId: ''}],
    ['missing model name', {DataName: ' '}],
    ['missing project value field', {selectValParam: ''}],
    ['missing project label field', {selectTextParam: ''}],
    ['unexpected output parameter', {ValParamName: 'other'}],
  ])('rejects invalid config (%s) before mutating the view', async (_name, override) => {
    const {view} = await setup()
    await expect(configureNavHostProjectRelation(view, 'CATALOG', config(override))).rejects.toThrow()
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('preflights actual new-row fieldAccess and leaves no partial row when a field is denied', async () => {
    const {view} = await setup({deniedFields: ['selectTextParam']})
    expect(view.newRowFieldAccess('selectTextParam').write).toBe('denied')
    await expect(configureNavHostProjectRelation(view, 'CATALOG', config())).rejects.toThrow(/selectTextParam/u)
    expect(view.rows).toEqual([])
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('keeps DataView.addRow as the final permission guard after the command preflight', async () => {
    const {view} = await setup({deniedFields: ['selectTextParam']})
    const addRow = vi.spyOn(view, 'addRow')
    const allowed = view.newRowFieldAccess('prowid')
    vi.spyOn(view, 'newRowFieldAccess').mockReturnValue(allowed)

    await expect(configureNavHostProjectRelation(view, 'CATALOG', config())).rejects.toThrow(/selectTextParam/u)
    expect(addRow).toHaveBeenCalledTimes(1)
    expect(view.rows).toEqual([])
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('rejects duplicate existing relations for the same navigation before adding', async () => {
    const existing = (rowid: string): DataRow => ({rowid, ...config({selectTextParam: 'oldLabel'})})
    const {view} = await setup({rows: [existing('relation-a'), existing('relation-b')]})

    await expect(configureNavHostProjectRelation(view, 'CATALOG', config())).rejects.toThrow('导航宿主关系已存在多条')
    expect(view.getEditingPatch('relation-a')).toBeUndefined()
    expect(view.getEditingPatch('relation-b')).toBeUndefined()
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('rejects a single existing relation instead of creating a duplicate', async () => {
    const existing: DataRow = {rowid: 'relation-a', ...config()}
    const {view} = await setup({rows: [existing]})
    const addRow = vi.spyOn(view, 'addRow')

    await expect(configureNavHostProjectRelation(view, 'CATALOG', config())).rejects.toThrow('导航宿主关系已存在，拒绝重复新增')
    expect(addRow).not.toHaveBeenCalled()
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })

  it('requires the exact metadata DataSet scenario rather than a same-named model in another space', async () => {
    const {view} = await setup()
    await expect(configureNavHostProjectRelation(view, 'ANOTHER-SPACE', config())).rejects.toThrow('数据空间身份不匹配')
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
  })
})
