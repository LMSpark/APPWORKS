import {expect, it, vi} from 'vitest'
import {config, flushPromises, mount} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import {SystemPageIdentityPool} from '../../../../packages/spark-app/src/router/system-page-identity/system-page-identity-pool'
import {createMemoryHistory, createRouter, RouterView, useRoute} from 'vue-router'
import ElementPlus from 'element-plus'
import {DataSet, bindDataSetReadonlyCommandQuery, getSparkNodeChildren} from '@spark-appworks/spark-data'
import {RendererTable, Spark, registerAllRenderers} from '@spark-appworks/spark-component'
import * as scenarioLoader from '@/lowcode/data-space/lowcode-data-space-runtime'
import DataRecoveryPage from '@/views/features/system/data-recovery/ui/data-recovery-page.vue'
import {withTestPageService} from '../../../support/helpers/page-service-host'

it('renders only the selected recovery table fields while the next field result is pending', async () => {
  const scenarioId = '70D5D8FACCC201A822F64B16A441BE8F'
  const models = {
    Base_AppSystemList: ['rowid', 'AppDesc', 'AppName'],
    Base_AppAndSource_Relation: ['rowid', 'conName', 'conid'],
    _Base_TblList: ['rowid', 'tbldesc', 'tblname'],
    Base_TblField: ['rowid', 'tblid', 'enname', 'cnname'],
    获取软删除的数据: ['rowid', 'before', 'after'],
    获取表数据: ['rowid', 'before', 'after'],
    Base_TableData_Recovery: ['rowid', 'sys_id', 'db_id', 'data_id', 'recovery_date', 'table_id', 'recovery_userid'],
  }
  const directoryModels = new Set(['Base_TblField', '_Base_TblList', 'Base_AppAndSource_Relation'])
  const ds = DataSet.fromJson({scenarioId, tables: Object.fromEntries(Object.entries(models).map(([modelName, names]) => [modelName, {
    ...(directoryModels.has(modelName)
      ? {resourceType: 'logical-view', resourceId: modelName}
      : {modelBinding: {modelId: modelName, modelName}}),
    columns: names.map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})),
    views: {default: {autoLoad: false, queryConfig: {pagination: 'none'}}},
  }]))})
  const tables = ds.getView('_Base_TblList')!, fields = ds.getView('Base_TblField')!
  const databases = ds.getView('Base_AppAndSource_Relation')!, all = ds.getView('获取表数据')!
  let fieldRows = [{rowid: 'F1', tblid: 'T1', enname: 'before', cnname: '原字段'}]
  bindDataSetReadonlyCommandQuery(fields, {resource: {resourceType: 'logical-view', resourceId: fields.tableName}, guard: () => {}, loadRows: async () => fieldRows})
  bindDataSetReadonlyCommandQuery(databases, {resource: {resourceType: 'logical-view', resourceId: databases.tableName}, guard: () => {}, loadRows: async () => [{rowid: 'D', conid: 'DB1', conName: '原库'}]})
  bindDataSetReadonlyCommandQuery(tables, {resource: {resourceType: 'logical-view', resourceId: tables.tableName}, guard: () => {}, loadRows: async () => [{rowid: 'T1', tblname: 'First'}, {rowid: 'T2', tblname: 'Second'}]})
  await Promise.all([fields.refresh(), databases.refresh(), tables.refresh()])
  databases.setCurrentRowById('D')
  tables.setCurrentRowById('T1')
  const loader = vi.spyOn(scenarioLoader, 'loadLowcodeRuntimeScenario').mockResolvedValue(ds)
  registerAllRenderers()
  const mainRead = vi.spyOn(ds.getView('Base_AppSystemList')!, 'refresh').mockResolvedValue(undefined)
  const allRead = vi.spyOn(all, 'refresh').mockResolvedValue(undefined)
  const path = '/apps/APP/recovery'
  const pool = new SystemPageIdentityPool()
  const host = defineComponent({setup() {
    const route = useRoute()
    const instance = pool.get(route, {scope: 'application', path, nodeId: 'RECOVERY', title: '数据恢复',
      pageId: 'RECOVERY', explicitQuery: {}, component: DataRecoveryPage})
    return () => h(instance.view)
  }})
  const router = createRouter({history: createMemoryHistory(), routes: [{path, component: host,
    meta: {nodeId: 'RECOVERY', blueprintScenarioId: scenarioId, systemPageIdentityState: 'resolved'}}]})
  await router.push(path)
  const originalStubs = config.global.stubs
  const stubs = {...originalStubs}
  for (const name of ['SparkComponentRenderer', 'spark-component-renderer']) delete stubs[name]
  config.global.stubs = stubs
  const wrapper = mount(withTestPageService(RouterView, router), {global: {plugins: [router, ElementPlus, Spark.createPlugin()]}})
  try {
    const deletedFields = () => {
      const table = wrapper.findAllComponents(RendererTable).find(item => item.props('dataViewKey') === scenarioId + '@获取软删除的数据@default')
      return table ? getSparkNodeChildren(table.props('children')).map(node => node.props?.['field']) : undefined
    }
    await vi.waitFor(() => expect(deletedFields()).toEqual(['before']))
    tables.setCurrentRowById('T2')
    await flushPromises()
    expect(deletedFields()).toEqual([])
    fieldRows = [...fieldRows, {rowid: 'F2', tblid: 'T2', enname: 'after', cnname: '新字段'}]
    await fields.refresh()
    await vi.waitFor(() => expect(deletedFields()).toEqual(['after']))
    expect(allRead).not.toHaveBeenCalled()
    const selectTab = async (name: string) => {
      await wrapper.get(`[role="tab"]#tab-${name}`).trigger('click')
      await flushPromises()
    }
    all.queryContext = {TbName: 'First', DbId: 'DB1'}
    await selectTab('all')
    expect(allRead).not.toHaveBeenCalled()
    await selectTab('deleted')
    all.queryContext = {TbName: 'Second', DbId: 'DB1'}
    await selectTab('all')
    expect(allRead).toHaveBeenCalledTimes(1)
  } finally {
    wrapper.unmount()
    config.global.stubs = originalStubs
    loader.mockRestore()
    mainRead.mockRestore()
    allRead.mockRestore()
  }
})
