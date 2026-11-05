import {afterEach, expect, it, vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import {createSourceFixture} from '../../structured-config/data-code/source-picker/fixture'
import {projectExcelTarget, stageExcelTarget} from '@/lowcode/resources/semi-structured/excel-import/target-selection'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {EXCEL_DESIGN, excelDesignModels, designText} from './excel-import-design.fixture'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {ExcelConfigurationEdit} from '@/lowcode/resources/semi-structured/excel-import/configuration-edit'
const disposers: Array<() => void> = []
afterEach(() => disposers.splice(0).forEach(dispose => dispose()))
async function source() {
  const f = await createSourceFixture(); disposers.push(() => f.runtime.dispose())
  const select = (table: string, id: string) => {const view = f.dataSet.getView(table)!, row = view.rows.find(row => view.getPkKey(row) === id)!; view.setCurrentRow(row); view.setSelectedRows([row])}
  await vi.waitFor(() => expect(f.dataSet.getView('Base_AppSystemList')!.requestState).toBe(RequestState.Loaded)); select('Base_AppSystemList', 'A1')
  await vi.waitFor(() => expect(f.dataSet.getView('Base_AppAndSource_Relation')!.rows).toHaveLength(1)); select('Base_AppAndSource_Relation', 'R1')
  await vi.waitFor(() => expect(f.dataSet.getView('_Base_TblList')!.rows).toHaveLength(2)); select('_Base_TblList', 'T1')
  await vi.waitFor(() => expect(f.dataSet.getView('Base_TblField', 'excelFields')!.requestState).toBe(RequestState.Loaded))
  return f
}
it('projects physical target identity and exact typed mappings without converting ordIdx into Excel indices', async () => {
  const f = await source()
  expect(projectExcelTarget(f.dataSet)).toEqual({applicationId: 'A1', applicationName: '应用一', table: '数据库一@table_one', description: '数据库一@table_one',
    fields: [{name: 'id', title: '编号', type: 1, index: ''}, {name: 'name', title: '名称', type: 0, index: ''}]})
  expect(f.http.saves).toEqual([])
})
it('accepts the application value member without inventing an application current-row requirement', async () => {
  const f = await source(), apps = f.dataSet.getView('Base_AppSystemList')!
  apps.setCurrentRow(null)
  expect(apps.getSelectedValues()).toEqual(['A1'])
  expect(() => projectExcelTarget(f.dataSet)).not.toThrow()
})
it('rejects foreign database identity and nontext source types instead of guessing mappings', async () => {
  const f = await source(), databases = f.dataSet.getView('Base_AppAndSource_Relation')!, row = databases.currentRow!
  row['sysid'] = 'FOREIGN'
  expect(() => projectExcelTarget(f.dataSet)).toThrow('数据库')
  row['sysid'] = 'A1'
  f.dataSet.getView('Base_TblField', 'excelFields')!.rows[0]!['DataType'] = 1
  expect(() => projectExcelTarget(f.dataSet)).toThrow('类型')
})

async function target() {
  const http = new ApiBackend(); http.primaryKeys['Base_Import_Transform_Rule'] = 'id'
  http.records = {Base_ImportData_Config: [{rowid: 'C1', schemeid: 'E1', pid: 'E1', sheetName: '原名称', table: 'OLD@TABLE'}],
    Base_ImportData_Field: [{rowid: 'OLD', configid: 'C1', name: 'old', title: '原字段', type: 0, index: '01'}], Base_Import_Transform_Rule: [], ImportExportMethods: []}
  const runtimeApi = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const ds = new LowcodeDataSpaceAssembler(runtimeApi, http).assemble({config: new ScenarioViewConfig(EXCEL_DESIGN, designText),
    space: {dataSpaceId: EXCEL_DESIGN, name: 'Excel'}, models: excelDesignModels(), relations: []}).dataSet
  const runtime = new PageRuntime({pageId: 'excel-target', scenarioIds: [EXCEL_DESIGN], scenarioInputs: {[EXCEL_DESIGN]: {importConfigId: 'E1'}}, loadScenario: async () => ds})
  disposers.push(() => runtime.dispose()); await runtime.load(); ds.triggerAutoLoad()
  const nodes = ds.getView('Base_ImportData_Config')!, fields = ds.getView('Base_ImportData_Field')!
  await vi.waitFor(() => expect(nodes.requestState).toBe(RequestState.Loaded)); nodes.setCurrentRow(nodes.rows[0]!); nodes.setSelectedRows([nodes.rows[0]!])
  await vi.waitFor(() => expect(fields.requestState).toBe(RequestState.Loaded))
  return {ds, nodes, fields, http}
}
it('stages the replacement in original views without saving and retains unrelated node edits', async () => {
  const s = await source(), f = await target(); f.nodes.updateEditingValue('C1', 'sheetName', '此前名称草稿')
  const staged = await stageExcelTarget({...f, nodeId: 'C1', selection: projectExcelTarget(s.dataSet), assertCurrent: () => {}})
  expect(f.nodes.getEditingRow('C1')).toMatchObject({sheetName: '此前名称草稿', table: '数据库一@table_one', relatedappid: 'A1'})
  expect(f.fields.rows.map(row => row['name'])).toEqual(['id', 'name'])
  expect(f.fields.dirtyTracking.pendingDeleteIds.has('OLD')).toBe(true)
  expect(f.fields.rows.every(row => row['configid'] === 'C1' && row['index'] === '')).toBe(true)
  expect(f.http.saves).toEqual([])
  staged.cancel()
  expect(f.nodes.getEditingRow('C1')).toMatchObject({sheetName: '此前名称草稿', table: 'OLD@TABLE'})
  expect(f.fields.rows.map(row => row['rowid'])).toEqual(['OLD'])
  expect(f.fields.dirtyTracking.hasPendingChanges()).toBe(false)
})
it('restores the original field set and unrelated node draft if native staging is interrupted', async () => {
  const s = await source(), f = await target(); f.nodes.updateEditingValue('C1', 'sheetName', '此前名称草稿')
  const remove = vi.spyOn(f.fields, 'removeRow').mockRejectedValue(new Error('injected local interruption'))
  await expect(stageExcelTarget({...f, nodeId: 'C1', selection: projectExcelTarget(s.dataSet), assertCurrent: () => {}})).rejects.toThrow('local interruption')
  remove.mockRestore()
  expect(f.fields.rows.map(row => row['rowid'])).toEqual(['OLD'])
  expect(f.fields.dirtyTracking.hasPendingChanges()).toBe(false)
  expect(f.nodes.getEditingRow('C1')).toMatchObject({sheetName: '此前名称草稿', table: 'OLD@TABLE'})
  expect(f.http.saves).toEqual([])
})
it('preserves an old mapping edit arriving while source rows are being staged',async()=>{
 const s=await source(),f=await target(),add=f.fields.addRow.bind(f.fields)
 const spy=vi.spyOn(f.fields,'addRow').mockImplementation(async data=>{
  const row=await add(data);f.fields.updateEditingValue('OLD','title','并发本地标题');return row
 })
 await expect(stageExcelTarget({...f,nodeId:'C1',selection:projectExcelTarget(s.dataSet),assertCurrent:()=>{}})).rejects.toThrow('原字段')
 spy.mockRestore()
 expect(f.fields.getEditingRow('OLD')?.['title']).toBe('并发本地标题')
 expect(f.fields.dirtyTracking.pendingCreateIds.size).toBe(0)
 expect(f.fields.dirtyTracking.pendingDeleteIds.size).toBe(0)
 expect(f.http.saves).toEqual([])
})
it.each(['title','index'])('compares fresh %s against the native pending-delete snapshot',async field=>{
 const s=await source(),f=await target(),command=await ExcelConfigurationEdit.stage({dataSet:f.ds,nodeId:'C1',source:s.dataSet,assertCurrent:()=>{}})
 expect(f.fields.rows.some(row=>row['rowid']==='OLD')).toBe(false)
 expect(f.fields.dirtyTracking.getPendingDeleteSnapshot('OLD')).toBeDefined()
 f.http.records['Base_ImportData_Field']![0]![field]='远端修改'
 await expect(command.save()).rejects.toThrow('映射已变化')
 expect(f.http.saves).toEqual([])
})
it('refuses classical source replacement in enabled relative layout without changing hidden mappings',async()=>{
 const s=await source(),f=await target(),rows=f.fields.readSnapshot().rows
 f.nodes.updateEditingValue('C1','sheet_layout_json','{"enabled":true,"version":1,"regions":[]}')
 await expect(stageExcelTarget({...f,nodeId:'C1',selection:projectExcelTarget(s.dataSet),assertCurrent:()=>{}})).rejects.toThrow('相对版式')
 expect(f.fields.readSnapshot().rows).toEqual(rows)
 expect(f.fields.dirtyTracking.hasPendingChanges()).toBe(false)
 expect(f.http.saves).toEqual([])
})
it('commits target and mappings through one native multi-view batch and never resaves a completed command', async () => {
  const s = await source(), f = await target()
  const command = await ExcelConfigurationEdit.stage({dataSet: f.ds, nodeId: 'C1', source: s.dataSet, assertCurrent: () => {}})
  const save = vi.spyOn(f.ds, 'saveChanges')
  await command.save()
  expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.calls[0]![0]!.views?.map(view => view.tableName)).toEqual(['Base_ImportData_Field', 'Base_ImportData_Config'])
  expect(f.http.records['Base_ImportData_Config']![0]!['table']).toBe('数据库一@table_one')
  expect(f.http.records['Base_ImportData_Field']!.map(row => row['name'])).toEqual(['id', 'name'])
  expect(command.getState().done).toBe(true)
  await command.save(); expect(save).toHaveBeenCalledTimes(1)
})
it('uses the original joint capture to verify a lost reply without resubmitting either model', async () => {
  const s = await source(), f = await target()
  const command = await ExcelConfigurationEdit.stage({dataSet: f.ds, nodeId: 'C1', source: s.dataSet, assertCurrent: () => {}})
  f.http.failAfterWrite = true
  await expect(command.save()).rejects.toThrow()
  const writes = f.http.saves.length
  expect(command.getState().canCancel).toBe(false)
  expect(() => command.cancel()).toThrow('核验')
  await command.save()
  expect(f.http.saves).toHaveLength(writes)
  expect(command.getState().done).toBe(true)
})
it('rejects a late direct child without refreshing the original reference contract or dispatching writes', async () => {
  const s = await source(), f = await target()
  const command = await ExcelConfigurationEdit.stage({dataSet: f.ds, nodeId: 'C1', source: s.dataSet, assertCurrent: () => {}})
  f.http.records['Base_ImportData_Config']!.push({rowid: 'LATE', schemeid: 'E1', pid: 'C1', parentField: 'old'})
  await expect(command.save()).rejects.toThrow('引用已变化')
  await expect(command.save()).rejects.toThrow('引用已变化')
  expect(f.http.saves).toEqual([])
  command.cancel()
  expect(f.fields.rows.map(row => row['rowid'])).toEqual(['OLD'])
})
it('refuses a late invalid node draft arriving during the asynchronous reference preflight', async () => {
  const s = await source(), f = await target()
  const command = await ExcelConfigurationEdit.stage({dataSet: f.ds, nodeId: 'C1', source: s.dataSet, assertCurrent: () => {}})
  let release!: () => void, entered = false
  const gate = new Promise<void>(resolve => {release = resolve})
  f.http.interceptors.request.use({onRequest: async request => {
    if (!entered && request.url?.includes('GetData')) {entered = true; await gate}
    return request
  }})
  const save = command.save()
  await vi.waitFor(() => expect(entered).toBe(true))
  f.nodes.updateEditingValue('C1', 'sorted', JSON.stringify([{Field: 'old', Type: 'ascending'}]))
  release()
  await expect(save).rejects.toThrow('草稿')
  expect(f.http.saves).toEqual([])
})
it('rejects an immediate field view before a source preview can dispatch any write', async () => {
  const s = await source(), f = await target(); f.fields.commitMode = 'immediate'
  await expect(stageExcelTarget({...f, nodeId: 'C1', selection: projectExcelTarget(s.dataSet), assertCurrent: () => {}})).rejects.toThrow('暂存')
  expect(f.http.saves).toEqual([])
})
it('refuses a same-count replacement of the original mapping identities before dispatch', async () => {
  const s = await source(), f = await target()
  const command = await ExcelConfigurationEdit.stage({dataSet: f.ds, nodeId: 'C1', source: s.dataSet, assertCurrent: () => {}})
  f.http.records['Base_ImportData_Field']![0]!['rowid'] = 'REPLACED'
  await expect(command.save()).rejects.toThrow('映射已变化')
  expect(f.http.saves).toEqual([])
})

it.each(['nodes', 'fields'] as const)('reapplies the entire joint intent after a local %s apply failure instead of saving mappings alone', async failing => {
  const s = await source(), f = await target()
  const command = await ExcelConfigurationEdit.stage({dataSet: f.ds, nodeId: 'C1', source: s.dataSet, assertCurrent: () => {}})
  vi.spyOn(f[failing], 'applyEditingRows').mockRejectedValueOnce(new Error('local apply failure'))
  await expect(command.save()).rejects.toThrow('local apply failure')
  expect(command.getState()).toMatchObject({dispatched: false})
  expect(f.http.saves).toEqual([])
  await command.save()
  expect(f.http.records['Base_ImportData_Config']![0]!['table']).toBe('数据库一@table_one')
  expect(f.http.records['Base_ImportData_Field']!.map(row => row['name'])).toEqual(['id', 'name'])
  expect(command.getState().done).toBe(true)
})

it('explicitly accepts a current formal result after an incomplete receipt without claiming command success or replaying', async () => {
  const s = await source(), f = await target(), command = await ExcelConfigurationEdit.stage({dataSet: f.ds, nodeId: 'C1', source: s.dataSet, assertCurrent: () => {}})
  const originalSave = f.ds.saveChanges.bind(f.ds)
  vi.spyOn(f.ds, 'saveChanges').mockImplementation(async options => {
    const result = await originalSave(options)
    return {...result, data: {...result.data!, viewResults: result.data!.viewResults.slice(1)}}
  })
  await expect(command.save()).rejects.toThrow()
  const writes = f.http.saves.length
  await expect(command.save()).rejects.toThrow('回执无效')
  expect(command.getState()).toMatchObject({canAcceptCurrent: true, done: false})
  await command.acceptCurrent()
  expect(command.getState()).toMatchObject({done: true, acceptedCurrent: true})
  expect(f.http.saves).toHaveLength(writes)
})

it('rechecks fresh write permission on already applied node fields after a local mapping apply failure', async () => {
  const s = await source(), f = await target()
  const command = await ExcelConfigurationEdit.stage({dataSet: f.ds, nodeId: 'C1', source: s.dataSet, assertCurrent: () => {}})
  vi.spyOn(f.fields, 'applyEditingRows').mockRejectedValueOnce(new Error('mapping local apply failed'))
  await expect(command.save()).rejects.toThrow('mapping local apply failed')
  f.http.interceptors.response.use({onResponse: response => {
    const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
    const body: unknown = response.data
    if (record(body) && record(body['Result']) && record(body['Result']['data']) && Array.isArray(body['Result']['data']['Items'])) {
      for (const row of body['Result']['data']['Items']) if (record(row) && row['rowid'] === 'C1' && Object.hasOwn(row, 'table') && record(row['lingma_sys_params'])) {
        const permissions = row['lingma_sys_params']
        if (Array.isArray(permissions['e'])) permissions['e'] = permissions['e'].filter((field: unknown) => field !== 'table')
      }
    }
    return response
  }})
  await expect(command.save()).rejects.toThrow('不允许修改目标')
  expect(f.http.saves).toEqual([])
})

it('keeps opaque mapping identities in the first proof when the displayed primary-key field is masked',async()=>{
  const s=await source(),f=await target()
  const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  f.http.interceptors.response.use({onResponse:response=>{
    const body:unknown=response.data
    if(record(body)&&record(body['Result'])&&record(body['Result']['data'])&&Array.isArray(body['Result']['data']['Items']))for(const row of body['Result']['data']['Items'])if(record(row)&&row['configid']==='C1'&&record(row['lingma_sys_params']))row['lingma_sys_params']['m']=['rowid']
    return response
  }})
  await f.fields.refresh()
  const command=await ExcelConfigurationEdit.stage({dataSet:f.ds,nodeId:'C1',source:s.dataSet,assertCurrent:()=>{}})
  f.http.records['Base_ImportData_Field']![0]!['rowid']='REPLACED'
  await expect(command.save()).rejects.toThrow('映射已变化')
  expect(f.http.saves).toEqual([])
})

it.each([true,false])('checks the final edited title of a same-batch source mapping (matching=%s)',async matching=>{
 const s=await source(),f=await target(),command=await ExcelConfigurationEdit.stage({dataSet:f.ds,nodeId:'C1',source:s.dataSet,assertCurrent:()=>{}})
 const row=f.fields.rows.find(row=>row['name']==='id')!,id=f.fields.getPkKey(row)!
 f.fields.updateEditingValue(id,'title','修改后的标题')
 f.nodes.updateEditingValue('C1','foreignKeyField','id');f.nodes.updateEditingValue('C1','foreignKeyFieldDesc',matching?'修改后的标题':'编号')
 if(matching){await command.save();expect(f.http.records['Base_ImportData_Config']![0]!['foreignKeyFieldDesc']).toBe('修改后的标题')}
 else {await expect(command.save()).rejects.toThrow('标题');expect(f.http.saves).toEqual([])}
})
it('refuses source staging when a masked node key invalidates its formal tree or cascade input',async()=>{
 const s=await source(),f=await target()
 const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)
 f.http.interceptors.response.use({onResponse:response=>{
  const body:unknown=response.data
  if(record(body)&&record(body['Result'])&&record(body['Result']['data'])&&Array.isArray(body['Result']['data']['Items']))for(const row of body['Result']['data']['Items'])if(record(row)&&row['schemeid']==='E1'&&record(row['lingma_sys_params']))row['lingma_sys_params']['m']=['rowid']
  return response
 }})
 await f.nodes.refresh()
 await expect(ExcelConfigurationEdit.stage({dataSet:f.ds,nodeId:'C1',source:s.dataSet,assertCurrent:()=>{}})).rejects.toThrow('查询未就绪')
 expect(f.http.saves).toEqual([])
})
