import {afterEach, describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import { DataSpaceRuntimeApi } from '@spark-appworks/spark-data'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {DataSet} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceAssembler} from '@/platform-adapters/data-space/lowcode-data-space-assembler'
import {WorkflowFlowModelManager} from '@/platform-adapters/resources/system/workflow/manage/flow-model-manager'
import {buildFormalModels} from '../../catalog/structured-config-catalog.fixture'
import {ApiBackend} from '../../../api-provider/api-provider.fixture'

const auth = vi.hoisted(() => ({userId: 'USER', applicationId: 'APP'}))
vi.mock('@/platform-adapters/lowcode-runtime', () => ({readLowcodePrincipal: () => auth.userId ? {...auth} : null}))
const dataSets: DataSet[] = []
afterEach(() => {dataSets.splice(0).forEach(ds => ds.destroy()); auth.userId = 'USER'; vi.useRealTimers()})

async function directory() {
  const scenarioId = '87F0EF6AD1B64D67FFE597E7E3285994'
  const text = readFileSync('config/pages/workflow/flow-model-list/pagedata.json', 'utf8').replace('__SCENARIO__', scenarioId)
  // Independent formal fields captured from the directory contract; STATE is a real input but not an output.
  const models = buildFormalModels({WFM_FLOW_MODLE: ['rowid', 'TITLE', 'MEMO', 'CRTUSER', 'CRTDATE', 'STATE', 'BusinessTable', 'sysid', 'createuser'],
    Base_UserInfo: ['ID', 'rowid', 'UserName']}).map(model => ({...model,
      id: `${scenarioId}${model.name === 'WFM_FLOW_MODLE' ? 'p000' : 'p001'}`,
      fields: model.fields.map(field => ({...field, output: field.name !== 'STATE'})),
    }))
  const http = new ApiBackend()
  http.records = {WFM_FLOW_MODLE: [{rowid: 'OLD', TITLE: 'Original', MEMO: '', CRTUSER: 'CREATOR', CRTDATE: '2026-01-01', STATE: '1', BusinessTable: '', sysid: 'APP', createuser: 'USER-ROW'}],
    Base_UserInfo: [{ID: 'USER-PERMISSION-ID', rowid: 'USER-ROW', UserName: '用户甲'}]}
  const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
  const ds = new LowcodeDataSpaceAssembler(runtime, http).assemble({config: new ScenarioViewConfig(scenarioId, text),
    space: {dataSpaceId: scenarioId, name: '流程目录'}, models, relations: []}).dataSet
  dataSets.push(ds)
  const view = ds.getView('WFM_FLOW_MODLE')!, users = ds.getView('Base_UserInfo')!
  const manager = new WorkflowFlowModelManager(view, {userView: users})
  await manager.refresh()
  return {manager, view, users, http}
}

describe('workflow directory native creation and original records', () => {
  it('stages original defaults, cancels without writes, then saves only a complete new model and trims later edits', async () => {
    const {manager, view, http} = await directory()
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 17, 14, 5))
    await manager.beginAdd()
    expect(http.saves).toEqual([])
    expect(view.currentRow).toMatchObject({CRTUSER: 'USER', CRTDATE: '2026-11-17', STATE: '1', BusinessTable: '', sysid: 'APP'})
    view.discardPendingChanges(); view.setCurrentRow(null)
    expect(view.rows.map(row => row['rowid'])).toEqual(['OLD'])
    await manager.beginAdd()
    const key = view.getPkKey(view.currentRow!)!
    view.updateEditingValue(key, 'TITLE', '  New flow  '); view.updateEditingValue(key, 'MEMO', '  Notes  ')
    await manager.saveCurrent()
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.added).toEqual([{rowid: key, TITLE: 'New flow', MEMO: 'Notes', CRTUSER: 'USER', CRTDATE: '2026-11-17', STATE: '1', BusinessTable: '', sysid: 'APP'}])
    expect(view.rows.find(row => row['rowid'] === key)).not.toHaveProperty('STATE')
    const created = view.rows.find(row => row['rowid'] === key)!
    manager.beginEdit(created); view.updateEditingValue(key, 'TITLE', '  Renamed  ')
    await manager.saveCurrent()
    expect(http.saves[1]!.changed).toEqual([{rowid: key, TITLE: 'Renamed'}])
    expect(http.records['WFM_FLOW_MODLE']!.find(row => row['rowid'] === key)).toMatchObject({CRTUSER: 'USER', STATE: '1', TITLE: 'Renamed'})
  })

  it('preserves raw creator identity while loading standard user options and uses original delete permission', async () => {
    const {view, manager, http, users} = await directory()
    expect(view.rows[0]!['createuser']).toBe('USER-ROW')
    expect(users.rows[0]).toMatchObject({rowid: 'USER-ROW', UserName: '用户甲'})
    http.denyDelete.add('WFM_FLOW_MODLE'); await manager.refresh()
    expect(manager.canEditRow(view.rows[0]!)).toBe(true)
    expect(manager.canDeleteRow(view.rows[0]!)).toBe(false)
    expect(http.saves).toEqual([])
  })

  it('deletes an allowed row through the same view-wide save and refresh tail',async()=>{
    const {view,manager,http}=await directory()
    const refresh=vi.spyOn(view,'refresh')
    await manager.removeRow(view.rows[0]!)
    expect(http.saves).toHaveLength(1)
    expect(http.saves[0]!.deleted).toEqual([expect.objectContaining({rowid:'OLD'})])
    expect(view.rows).toEqual([])
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('keeps a lost delete receipt on the original view for readback without restaging',async()=>{
    const {view,manager,http}=await directory()
    const refresh=vi.spyOn(view,'refresh')
    http.failAfterWrite=true
    await expect(manager.removeRow(view.rows[0]!)).rejects.toThrow()
    expect(http.saves).toHaveLength(1)
    expect(view.hasUnconfirmedSave).toBe(true)
    expect(refresh).not.toHaveBeenCalled()
    const readsBeforeRecovery=http.reads.length
    expect((await view.dataSet!.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId}]})).success).toBe(true)
    const recoveryRead=http.reads.slice(readsBeforeRecovery).find(read=>read.table==='WFM_FLOW_MODLE')
    expect(recoveryRead?.data).toMatchObject({Table:[{Name:'WFM_FLOW_MODLE',
      Filter:{Type:'cond',Field:'rowid',Operator:'in',Value:null,ValueFun:{Type:'GetConstValue',Value:['OLD']}}}]})
    expect(refresh).not.toHaveBeenCalled()
    expect(http.saves).toHaveLength(1)
    await manager.refresh()
    expect(refresh).toHaveBeenCalledOnce()
    expect(view.rows).toEqual([])
  })

  it('requires an authenticated creator and rejects a blank title without dispatching a write', async () => {
    const {manager, view, http} = await directory()
    auth.userId = ''
    await expect(manager.beginAdd()).rejects.toThrow()
    expect(view.dirtyTracking.hasPendingChanges()).toBe(false)
    auth.userId = 'USER'; await manager.beginAdd()
    await expect(manager.saveCurrent()).rejects.toThrow('流程名称')
    expect(http.saves).toEqual([])
    expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
  })
})
