import {afterEach, expect, it, vi} from 'vitest'
import {ExcelConfigurationRemoval} from '@/lowcode/resources/semi-structured/excel-import/configuration-removal'
import {excelDesignRuntime} from './excel-import-design.fixture'
const disposers: Array<() => void> = []
afterEach(() => disposers.splice(0).forEach(dispose => dispose()))
async function fixture() {
  const f = await excelDesignRuntime({Base_ImportData_Config: [
    {rowid: 'C1', schemeid: 'E1', pid: 'E1', sheetName: '待删'},
    {rowid: 'SIB', schemeid: 'E1', pid: 'E1', sheetName: '保留', sheet_layout_json: '{"version":1,"literal":"C1","regions":[{"table":"C1"}]}'},
    {rowid: 'OTHER', schemeid: 'E2', pid: 'E2', sheetName: '其他方案'}],
  Base_ImportData_Field: [{rowid: 'F1', configid: 'C1', name: 'one'}, {rowid: 'FS', configid: 'SIB', name: 'keep'}],
  Base_Import_Transform_Rule: [{id: 'R1', scheme_id: 'E1', config_id: 'C1', enabled: 0}, {id: 'RS', scheme_id: 'E1', config_id: 'SIB', enabled: 1}], ImportExportMethods: []})
  disposers.push(() => f.runtime.dispose())
  const open = () => ExcelConfigurationRemoval.open({dataSet: f.ds, schemeId: 'E1', nodeId: 'C1', assertCurrent: () => {}})
  return {...f, open}
}
it('cancels preview without mutations and deletes exact leaf dependencies including disabled rules', async () => {
  const f = await fixture(), preview = await f.open()
  expect(preview.getState()).toMatchObject({fields: 1, rules: 1, canCancel: true})
  preview.cancel(); expect(f.http.saves).toEqual([])
  const command = await f.open(); await command.save()
  expect(f.http.records['Base_ImportData_Config']!.map(row => row['rowid'])).toEqual(['SIB', 'OTHER'])
  expect(f.http.records['Base_ImportData_Field']!.map(row => row['rowid'])).toEqual(['FS'])
  expect(f.http.records['Base_Import_Transform_Rule']!.map(row => row['id'])).toEqual(['RS'])
  expect(command.getState()).toMatchObject({done: true, databaseConfirmed: true})
  const count = f.http.saves.length; await command.save(); expect(f.http.saves).toHaveLength(count)
})
it.each(['E1', 'E2'])('refuses a direct child in scheme %s without deleting either branch', async schemeid => {
  const f = await fixture(); f.http.records['Base_ImportData_Config']!.push({rowid: 'CHILD', schemeid, pid: 'C1'})
  await expect(f.open()).rejects.toThrow(/子级|子配置/)
  expect(f.http.saves).toEqual([])
})
it('refuses a foreign-scheme rule rather than hiding it with a scheme filter', async () => {
  const f = await fixture(); f.http.records['Base_Import_Transform_Rule']!.push({id: 'BAD', scheme_id: 'E2', config_id: 'C1'})
  await expect(f.open()).rejects.toThrow('规则归属')
  expect(f.http.saves).toEqual([])
})
it('keeps the first dependency identities when a late rule appears during preview', async () => {
  const f = await fixture(), command = await f.open()
  f.http.records['Base_Import_Transform_Rule']!.push({id: 'LATE', scheme_id: 'E1', config_id: 'C1'})
  await expect(command.save()).rejects.toThrow('依赖已变化')
  expect(command.getState().rules).toBe(1)
  await expect(command.save()).rejects.toThrow('依赖已变化')
  expect(f.http.saves).toEqual([]); command.cancel()
})
it('verifies a lost joint reply and completes readback without repeating any delete', async () => {
  const f = await fixture(), command = await f.open(); f.http.failAfterWrite = true
  await expect(command.save()).rejects.toThrow()
  const count = f.http.saves.length
  expect(command.getState().canCancel).toBe(false)
  await command.save(); expect(f.http.saves).toHaveLength(count)
  expect(command.getState().done).toBe(true)
})
it('retains database confirmation when refreshing the original page fails and resumes only reads', async () => {
  const f = await fixture(), command = await f.open(), fail = vi.spyOn(f.nodes, 'refresh').mockRejectedValueOnce(new Error('page refresh interrupted'))
  await expect(command.save()).rejects.toThrow('page refresh interrupted')
  expect(command.getState()).toMatchObject({databaseConfirmed: true, done: false})
  const count = f.http.saves.length; fail.mockRestore(); await command.save()
  expect(f.http.saves).toHaveLength(count); expect(command.getState().done).toBe(true)
})
it('protects an explicit v3 design association without scanning arbitrary literal strings', async () => {
  const f = await fixture()
  f.http.records['Base_ImportData_Config']![1]!['sheet_layout_json'] = '{"version":3,"enabled":false,"tables":[{"id":"T","configId":"C1"}]}'
  await expect(f.open()).rejects.toThrow('布局仍声明引用')
  expect(f.http.saves).toEqual([])
})

it('explicitly accepts a current formal result after an incomplete receipt without claiming command success or replaying', async () => {
  const f = await fixture(), command = await f.open()
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
