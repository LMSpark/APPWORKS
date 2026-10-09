import { describe, expect, it } from 'vitest'
import { DataSpaceRuntimeApi, type DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import { ScenarioViewFile } from '@spark-appworks/spark-project-model'
import { HttpClientBase, isRecord, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'
import { RequestState, type TreeConfig } from '@spark-appworks/spark-data'
import { LowcodeDataSpaceAssembler } from '@/lowcode/data-space/lowcode-data-space-assembler'
import { buildTreeTableRows } from '../../../../../packages/spark-component/src/components/containers/data-views/view-tree-state'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
const model: FormalModel = {
  id: 'MODEL', metaName: 'Nodes', name: 'Nodes', sourceName: 'PhysicalNodes', sourceId: 'RESOURCE',
  sourceType: 'table', primaryKey: 'nodeKey', businessMain: true, raw: {},
  fields: [['KEY', 'rowid', 'nodeKey'], ['PARENT', 'parent_ref', 'parentKey'],
    ['TITLE', 'title', 'caption'], ['EXTRA', 'extra', 'extra']].map(([id, name, canonicalName], index) => ({
      id: id!, name: name!, canonicalName: canonicalName!, modelId: 'MODEL', type: 'string',
      primaryKey: index === 0, description: '', output: true, computed: false, order: index, orderType: '', raw: {},
    })),
}
const projection = [{fieldId: 'TITLE', source: 'resource', resourceFieldId: 'TITLE',
  resourceField: 'caption', viewField: 'caption', type: 'string', label: 'Title', output: true,
  sortOrder: 0, sortDirection: null, group: 0, distinct: false, primaryKey: false,
  value: '', valueFunction: '', expression: ''}]

class TreeHttp extends HttpClientBase {
  formal = model
  readonly requests: RequestConfig[] = []
  problem: {field: string; kind: 'missing' | 'hidden' | 'masked'} | undefined
  data: Array<Record<string, unknown>> = [
    {nodeKey: 'parent', parentKey: null, caption: 'Parent', extra: 'Root label'},
    {nodeKey: 'child', parentKey: 'parent', caption: 'Child', extra: 'Child label'},
  ]
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      return {data: {Code: 200, Result: {maplistedit: [{PhysicalNodes: [{rowid: 'child', title: 'Saved'}]}]}},
        status: 200, statusText: 'OK', headers: {}}
    }
    if (config.url !== '/api/DataOperation/GetData') throw new Error('unexpected endpoint')
    const body = config.data
    if (!isRecord(body) || !Array.isArray(body['Table']) || !isRecord(body['Table'][0])) throw new Error('invalid query')
    const fields = body['Table'][0]['Fields']
    if (!Array.isArray(fields)) throw new Error('missing fields')
    const requested = new Set(fields.map(field => isRecord(field) ? field['Name'] : undefined))
    const rows = this.data.map(source => {
      const row: Record<string, unknown> = {}
      for (const field of this.formal.fields) {
        if (requested.has(field.name) && Object.hasOwn(source, field.canonicalName)
          && !(this.problem?.kind === 'missing' && this.problem.field === field.canonicalName)) {
          row[field.canonicalName] = source[field.canonicalName]
        }
      }
      const restriction = this.problem?.kind === 'hidden' ? {h: [this.problem.field]}
        : this.problem?.kind === 'masked' ? {m: [this.problem.field]} : {}
      return {...row, lingma_sys_key: `SIGNED-${String(source['nodeKey'])}`,
        lingma_sys_params: {e: ['caption'], ...restriction}}
    })
    return {data: {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false,
      data: {Items: rows, Count: rows.length}}}, status: 200, statusText: 'OK', headers: {}}
  }
}

function fixture(treeConfig: TreeConfig = {idField: 'nodeKey', parentIdField: 'parentKey', textField: 'caption', treeMode: 'nested'},
  formal: FormalModel = model) {
  const http = new TreeHttp()
  http.formal = formal
  const text = JSON.stringify({scenarioId: 'SCENE', tables: {nodes: {
    modelBinding: {modelId: 'MODEL', modelName: 'Nodes'}, views: {
      default: {}, tree: {fieldProjection: projection, treeConfig, autoCurrentFirst: false, autoSelectFirst: false},
    },
  }}})
  const file = new ScenarioViewFile('SCENE', text)
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
  const assembler = new LowcodeDataSpaceAssembler(runtime, http)
  const assemble = (source: ScenarioViewFile) => assembler.assemble({config: source.value,
    space: {dataSpaceId: 'SCENE', name: 'Tree space'}, models: [formal], relations: []}).dataSet
  const dataSet = assemble(file)
  return {http, file, text, dataSet, assemble, view: dataSet.getView('nodes', 'tree')!, other: dataSet.getView('nodes', 'default')!}
}

function treeRows(view: ReturnType<typeof fixture>['view']) {
  return buildTreeTableRows({view, rows: view.rows, treeConfig: view.treeConfig, primaryKey: view.primaryKey})
}

describe('formal tree view query projection', () => {
  it.each(['configured', 'call'] as const)('keeps parent-child structure with %s title-only output and saves through its signed context', async source => {
    const f = fixture()
    try {
      await f.other.loadFromServer()
      await f.view.loadFromServer(source === 'call' ? {fields: ['caption']} : {})
      expect(treeRows(f.view)).toMatchObject([{id: 'parent', name: 'Parent', children: [{id: 'child', name: 'Child'}]}])
      expect(treeRows(f.view)).toHaveLength(1)
      expect(f.view.columns.filter(column => !column.isComputed).map(column => column.name)).toEqual(['caption'])
      expect(f.view.rows[1]).toMatchObject({nodeKey: 'child', parentKey: 'parent', caption: 'Child'})
      expect(f.view.rows[1]?.['extra']).toBeUndefined()
      expect(f.http.requests[1]?.data).toMatchObject({OutputFieldMode: 'REQUEST', Table: [{Fields: [
        expect.objectContaining({Name: 'title'}), expect.objectContaining({Name: 'rowid'}),
        expect.objectContaining({Name: 'parent_ref'}),
      ]}]})
      expect(JSON.stringify(f.http.requests[1]?.data)).not.toContain('SelfRefData')
      expect(await f.view.editRowById('child', {caption: 'Changed'})).toBe(true)
      await expect(f.view.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 1}})
      expect(f.http.requests.at(-1)?.data).toEqual([{TableName: 'Nodes', CrudModel: {Added: [], Deleted: [],
        Changed: [{rowid: 'child', title: 'Changed', lingma_sys_key: 'SIGNED-child'}]}}])
      expect(f.view.rows[1]?.['caption']).toBe('Saved')
      expect(f.other.rows[1]?.['caption']).toBe('Child')
      expect(f.file.getText()).toBe(f.text)
    } finally { f.dataSet.destroy() }
  })

  for (const field of ['nodeKey', 'parentKey', 'caption']) {
    it.each(['missing', 'hidden', 'masked'] as const)(`rejects %s ${field} without publishing a new tree or reusing write access`, async kind => {
      const f = fixture()
      try {
        await f.view.loadFromServer()
        const previous = f.view.rows
        f.http.problem = {field, kind}
        await expect(f.view.loadFromServer()).rejects.toThrow('SPARK_TREE_FIELD_UNAVAILABLE')
        expect(f.view.rows).toBe(previous)
        expect(f.view.requestState).toBe(RequestState.Failed)
        expect(f.view.fieldAccess(f.view.rows[1]!, 'caption').write).toBe('denied')
        await expect(f.view.editRowById('child', {caption: 'Forbidden'})).rejects.toThrow('DATA_VIEW_RESULT_STALE')
        f.http.problem = undefined
        await f.view.loadFromServer()
        expect(f.view.fieldAccess(f.view.rows[1]!, 'caption').write).toBe('allowed')
        expect(treeRows(f.view)).toHaveLength(1)
      } finally { f.dataSet.destroy() }
    })
  }

  it('loads the separately configured tree text without expanding visible columns', async () => {
    const f = fixture({idField: 'nodeKey', parentIdField: 'parentKey', textField: 'extra'})
    try {
      await f.view.loadFromServer()
      expect(treeRows(f.view)).toMatchObject([{name: 'Root label', children: [{name: 'Child label'}]}])
      expect(f.view.columns.filter(column => !column.isComputed).map(column => column.name)).toEqual(['caption'])
    } finally { f.dataSet.destroy() }
  })

  it.each(['idField', 'parentIdField', 'textField'] as const)('rejects an unresolvable %s before making a query', async key => {
    const f = fixture()
    try {
      f.view.treeConfig = {...f.view.treeConfig, [key]: 'missing'}
      await expect(f.view.loadFromServer()).rejects.toThrow('SPARK_MODEL_FIELD_UNRESOLVED')
      expect(f.http.requests).toHaveLength(0)
      expect(f.view.requestState).toBe(RequestState.Failed)
    } finally { f.dataSet.destroy() }
  })

  it('reassembles the same saved view configuration into an independent tree', async () => {
    const f = fixture()
    const reopened = f.assemble(new ScenarioViewFile('SCENE', f.file.getText()))
    try {
      await f.view.loadFromServer()
      const next = reopened.getView('nodes', 'tree')!
      await next.loadFromServer()
      expect(treeRows(next)).toMatchObject([{id: 'parent', children: [{id: 'child'}]}])
      expect(next).not.toBe(f.view)
      next.setSelectedRows([next.rows[1]!])
      expect(f.view.selectedRows).toEqual([])
      expect(next.fieldProjection).toEqual(projection)
      expect(f.file.getText()).toBe(f.text)
    } finally { f.dataSet.destroy(); reopened.destroy() }
  })

  it('retains numeric zero keys and null root parent values', async () => {
    const f = fixture()
    f.http.data = [{nodeKey: 0, parentKey: null, caption: 'Root'}, {nodeKey: 1, parentKey: 0, caption: 'Child'}]
    try {
      await f.view.loadFromServer()
      expect(treeRows(f.view)).toMatchObject([{id: 0, children: [{id: 1, parentId: 0}]}])
      expect(f.view.rows[1]?.['parentKey']).toBe(0)
    } finally { f.dataSet.destroy() }
  })

  it('keeps a legitimate empty result distinct from unavailable tree fields', async () => {
    const f = fixture()
    f.http.data = []
    try {
      await f.view.loadFromServer()
      expect(treeRows(f.view)).toEqual([])
      expect(f.view.requestState).toBe(RequestState.Loaded)
      expect(f.view.total).toBe(0)
    } finally { f.dataSet.destroy() }
  })

  it('preserves root-level and ID-label fallback when optional default fields do not exist', async () => {
    const f = fixture({idField: 'nodeKey'})
    try {
      await f.view.loadFromServer()
      expect(treeRows(f.view)).toMatchObject([{id: 'parent', name: 'parent'}, {id: 'child', name: 'child'}])
      expect(f.http.requests[0]?.data).toMatchObject({Table: [{Fields: [
        expect.objectContaining({Name: 'title'}), expect.objectContaining({Name: 'rowid'}),
      ]}]})
    } finally { f.dataSet.destroy() }
  })

  it('queries existing default parent and text fields by their formal names', async () => {
    const formal: FormalModel = {...model, fields: [...model.fields,
      {...model.fields[1]!, id: 'PARENT-DEFAULT', name: 'parent_default', canonicalName: 'parentId'},
      {...model.fields[2]!, id: 'TEXT-DEFAULT', name: 'name_default', canonicalName: 'name'},
    ]}
    const f = fixture({idField: 'nodeKey'}, formal)
    f.http.data = [{nodeKey: 'parent', parentId: null, name: 'Default parent', caption: 'P'},
      {nodeKey: 'child', parentId: 'parent', name: 'Default child', caption: 'C'}]
    try {
      await f.view.loadFromServer()
      expect(treeRows(f.view)).toMatchObject([{id: 'parent', name: 'Default parent', children: [{id: 'child', name: 'Default child'}]}])
      expect(f.http.requests[0]?.data).toMatchObject({Table: [{Fields: [
        expect.objectContaining({Name: 'title'}), expect.objectContaining({Name: 'rowid'}),
        expect.objectContaining({Name: 'parent_default'}), expect.objectContaining({Name: 'name_default'}),
      ]}]})
    } finally { f.dataSet.destroy() }
  })

  it('keeps configured local tree labels on the existing calculation path', async () => {
    const f = fixture()
    const config = new ScenarioViewFile('SCENE', JSON.stringify({scenarioId: 'SCENE', tables: {nodes: {
      modelBinding: {modelId: 'MODEL', modelName: 'Nodes'},
      columns: [{name: 'localLabel', type: 'string', computeExpression: 'caption + "!"'}],
      views: {default: {}, tree: {fieldProjection: projection,
        treeConfig: {idField: 'nodeKey', parentIdField: 'parentKey', textField: 'localLabel'}}},
    }}}))
    const dataSet = f.assemble(config)
    try {
      const view = dataSet.getView('nodes', 'tree')!
      await view.loadFromServer()
      expect(treeRows(view)).toMatchObject([{name: 'Parent!', children: [{name: 'Child!'}]}])
      expect(JSON.stringify(f.http.requests[0]?.data)).not.toContain('localLabel')
      expect(view.fieldAccess(view.rows[0]!, 'localLabel')).toMatchObject({read: 'visible', write: 'denied'})
    } finally { dataSet.destroy(); f.dataSet.destroy() }
  })
})
