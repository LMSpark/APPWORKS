import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {ProjectToolResource, ProjectWorkspace, type ProjectBlueprintTreeData} from '@spark-appworks/spark-project-model'
import config from '../../../../../config/pages/data-platform/data-space-design/pagedata.json'

const instances: DataSet[] = []
afterEach(() => instances.splice(0).forEach(item => item.destroy()))
function fixture(blueprintTreeProjection: (() => ProjectBlueprintTreeData | Promise<ProjectBlueprintTreeData>) | null = () => ({nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:['v1','v2'].map((version,index) => ({
  nodeId:String(index),parentNodeId:'ROOT',projectId:'APP',kind:'page',capability:{name:'One'},source:{VersionId:version},navigation:{target:'cfg:ONE',title:'One',order:index,publishInMenu:true,showChildren:true,beginGroup:false},
}))})) {
  let current = true
  const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {}})
  const dataSet = DataSet.fromJson({scenarioId: 'META', dataSetName: 'tools', tables: {ProjectToolCatalog: config.tables.ProjectToolCatalog, ProjectToolFile: config.tables.ProjectToolFile}})
  instances.push(dataSet)
  const resource = new ProjectToolResource({workspace, metadataScenarioId: 'META', assertCurrent: () => {if (!current) throw new Error('scope expired')}, ...(blueprintTreeProjection ? {blueprintTreeProjection} : {})})
  const catalog = dataSet.getView('ProjectToolCatalog')!
  catalog.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: ProjectToolResource.resources.ProjectToolCatalog}})
  return {dataSet, workspace, resource, catalog, expire() {current = false}}
}

describe('ProjectToolResource catalog projection', () => {
  it('queries a unique blueprint inventory and preserves all published pointers without editing the blueprint', async () => {
    const f = fixture()
    await f.catalog.refresh()
    expect(f.catalog.rows).toMatchObject([{pageId: 'ONE', versions: ['v1', 'v2']}]); expect(f.catalog.total).toBe(1)
    expect(f.catalog.editActionState(f.catalog.rows[0]!)).toBe('disabled'); expect(f.catalog.addActionState()).toBe('disabled')
    expect(f.workspace.getActivePageTool()).toBeNull()
  })

  it('projects the catalog only from an injected formal navigation DataView tree owner', async () => {
    const tree: ProjectBlueprintTreeData = {nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:[
      {nodeId:'ONE',parentNodeId:'ROOT',projectId:'APP',kind:'page',capability:{name:'One'},source:{VersionId:'v1'},navigation:{target:'cfg:ONE',title:'One',order:0,publishInMenu:true,showChildren:true,beginGroup:false},children:[]},
    ]}
    const projection = vi.fn(() => tree), f = fixture(projection)
    await f.catalog.refresh()
    expect(f.catalog.rows).toMatchObject([{pageId:'ONE',versions:['v1']}])
    expect(projection).toHaveBeenCalledOnce()
  })

  it('fails closed when the formal navigation tree owner is not injected', async () => {
    const f = fixture(null)
    await expect(f.catalog.loadFromServer()).rejects.toThrow('PROJECT_TOOL_CATALOG_OWNER')
  })

  it('rejects a tree projection completed after the host generation expires', async () => {
    let release!: (tree: ProjectBlueprintTreeData) => void
    const pending = new Promise<ProjectBlueprintTreeData>(resolve => {release = resolve})
    const projection = vi.fn(() => pending), f = fixture(projection)
    const query = f.catalog.loadFromServer({singleFlight:false})
    f.expire()
    release({nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:[]})
    await expect(query).rejects.toThrow('scope expired')
    expect(projection).toHaveBeenCalledOnce()
    expect(f.catalog.rows).toEqual([])
  })

  it('does not expose a second file save owner', () => {
    const f = fixture()
    expect(f.resource).not.toHaveProperty('save')
    expect(f.workspace).not.toHaveProperty('savePageFileChange')
    expect(f.workspace).not.toHaveProperty('previewPageFileRemote')
    expect(f.workspace).not.toHaveProperty('unconfirmedPageFiles')
  })
})
