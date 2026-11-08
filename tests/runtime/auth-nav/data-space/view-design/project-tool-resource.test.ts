import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet,bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {ProjectToolResource, ProjectWorkspace, type ProjectBlueprintTreeData} from '@spark-appworks/spark-project-model'
import config from '../../../../../config/pages/data-platform/data-space-design/pagedata.json'

const instances: DataSet[] = []
afterEach(() => instances.splice(0).forEach(item => item.destroy()))
function fixture(blueprintTreeProjection: (() => ProjectBlueprintTreeData | Promise<ProjectBlueprintTreeData>) | null = () => ({nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:['v1','v2'].map((version,index) => ({
  nodeId:String(index),parentNodeId:'ROOT',projectId:'APP',kind:'page',capability:{name:'One'},source:{VersionId:version},navigation:{target:'cfg:ONE',title:'One',order:index,publishInMenu:true,showChildren:true,beginGroup:false},
}))})) {
  let current = true
  const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {}})
  const dataSet = DataSet.fromJson(structuredClone({scenarioId: 'META', dataSetName: 'tools', tables: {ProjectToolCatalog: config.tables.ProjectToolCatalog, ProjectToolFile: config.tables.ProjectToolFile}}))
  instances.push(dataSet)
  const resource = new ProjectToolResource({workspace, metadataScenarioId: 'META', assertCurrent: () => {if (!current) throw new Error('scope expired')}, ...(blueprintTreeProjection ? {blueprintTreeProjection} : {})})
  const catalog = dataSet.getView('ProjectToolCatalog')!
  bindDataSetReadonlyCommandQuery(catalog, resource.queryBinding(catalog))
  return {dataSet, workspace, resource, catalog, expire() {current = false}}
}

describe('ProjectToolResource catalog projection', () => {
  it('allows unrelated row-local computed metadata without replacing the pointer source',async()=>{
    const f=fixture()
    f.dataSet.getTable('ProjectToolCatalog')!.addColumns([{name:'diagnostic',type:'number',computeExpression:'1'}])
    await f.catalog.refresh()
    expect(f.catalog.loadingError).toBeNull()
    expect(f.catalog.rows).toMatchObject([{pageId:'ONE',versions:['v1','v2']}])
  })

  it('rejects an out-of-project empty child module even under the correct root',async()=>{
    const f=fixture(()=>({nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:[
      {nodeId:'OTHER',parentNodeId:'ROOT',projectId:'OTHER',kind:'module',capability:{name:'Other'},source:{},children:[]},
    ]}))
    await expect(f.catalog.loadFromServer()).rejects.toThrow('PROJECT_TOOL_IDENTITY')
  })

  it.each(['pageId','versions'])('rejects a computed %s source column before reading the tree',async field=>{
    const projection=vi.fn(()=>({nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module' as const,capability:{name:'App'},source:{},children:[]})),f=fixture(projection)
    f.dataSet.getTable('ProjectToolCatalog')!.columns.find(column=>column.name===field)!.computeExpression=field==='versions'?'[]':"'forged'"
    await f.catalog.loadFromServer().catch(()=>undefined)
    expect(f.catalog.loadingError).toBeInstanceOf(Error)
    expect(projection).not.toHaveBeenCalled()
  })

  it('rejects an empty tree from another project instead of publishing an authoritative empty catalog',async()=>{
    const f=fixture(()=>({nodeId:'ROOT',parentNodeId:'',projectId:'OTHER',kind:'module',capability:{name:'Other'},source:{},children:[]}))
    await expect(f.catalog.loadFromServer()).rejects.toThrow('PROJECT_TOOL_IDENTITY')
    expect(f.catalog.rows).toEqual([])
  })


  it('keeps a registered derived view usable after its original default is released',async()=>{
    const f=fixture(),peer=f.catalog.createQueryView('derived')
    f.catalog.destroy()
    await peer.refresh()
    expect(peer.loadingError).toBeNull()
    expect(peer.rows).toMatchObject([{pageId:'ONE',versions:['v1','v2']}])
    expect(peer.addActionState()).toBe('hidden')
  })

  it('uses the original view for options without replacing its published rows',async()=>{
    const f=fixture()
    await f.catalog.refresh()
    const rows=f.catalog.rows
    const options=await f.catalog.queryOptionRows({fields:['pageId']})
    expect(options).toEqual([{pageId:'ONE'}])
    expect(f.catalog.rows).toBe(rows)
    expect(f.catalog.rows[0]?.['versions']).toEqual(['v1','v2'])
  })

  it.each(['field','key'] as const)('rejects unsupported %s before reading the blueprint projection',async mode=>{
    const projection=vi.fn(()=>({nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module' as const,capability:{name:'App'},source:{},children:[]})),f=fixture(projection)
    f.dataSet.getTable('ProjectToolCatalog')!.addColumns([{name:'extra',type:'string'}])
    if(mode==='key')f.catalog.primaryKey='extra'
    await f.catalog.loadFromServer(mode==='field'?{filter:{field:'extra',operator:'eq',value:'x'}}:{}).catch(()=>undefined)
    expect(f.catalog.loadingError).toBeInstanceOf(Error)
    expect(projection).not.toHaveBeenCalled()
  })

  it('rejects an old pending projection after its derived view is replaced with the same name',async()=>{
    let release:(tree:ProjectBlueprintTreeData)=>void=()=>{throw new Error('not started')}
    const pending=new Promise<ProjectBlueprintTreeData>(resolve=>{release=resolve}),f=fixture(()=>pending)
    const table=f.dataSet.getTable('ProjectToolCatalog')!,peer=f.catalog.createQueryView('same-name')
    const query=peer.loadFromServer()
    table.destroyView('same-name')
    const replacement=table.getOrCreateView('same-name')
    release({nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:[]})
    await expect(query).resolves.toMatchObject({success:false})
    expect(replacement.rows).toEqual([])
    expect(replacement).not.toBe(peer)
  })

  it('queries a unique blueprint inventory and preserves all published pointers without editing the blueprint', async () => {
    const f = fixture()
    await f.catalog.refresh()
    expect(f.catalog.rows).toMatchObject([{pageId: 'ONE', versions: ['v1', 'v2']}]); expect(f.catalog.total).toBe(1)
    expect(f.catalog.editActionState(f.catalog.rows[0]!)).toBe('hidden'); expect(f.catalog.addActionState()).toBe('hidden')
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
