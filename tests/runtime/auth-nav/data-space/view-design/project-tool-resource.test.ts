import {afterEach, describe, expect, it, vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {ProjectToolResource, ProjectWorkspace, type ProjectBlueprintTreeData} from '@spark-appworks/spark-project-model'
import config from '../../../../../config/pages/data-platform/data-space-design/pagedata.json'

const instances: DataSet[] = []
afterEach(() => instances.splice(0).forEach(item => item.destroy()))
function fixture(blueprintTreeProjection: (() => ProjectBlueprintTreeData | Promise<ProjectBlueprintTreeData>) | null = () => ({nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:['v1','v2'].map((version,index) => ({
  nodeId:String(index),parentNodeId:'ROOT',projectId:'APP',kind:'page',capability:{name:'One'},source:{VersionId:version},navigation:{target:'cfg:ONE',title:'One',order:index,publishInMenu:true,showChildren:true,beginGroup:false},
}))})) {
  const files = new Map([['ONE//rule.json', '{"type":"r-text"}'], ['ONE/v1/rule.json', '{"type":"r-button"}']])
  const writes: string[] = []
  let current = true, lose = false, block: Promise<void> | undefined
  const workspace = new ProjectWorkspace({projectId: 'APP', blueprint: {}, pageFiles: {
    readPageFile: async input => {await block; const value = files.get(`${input.pageId}/${input.versionId ?? ''}/${input.fileName}`); if (value === undefined) throw new Error('file missing'); return value},
    saveFileContent: async (id, name, text) => {writes.push(text); files.set(`${id}//${name}`, text); if (lose) {lose = false; throw new Error('reply lost')}},
  }})
  workspace.project.openPageDesign('ONE')
  const dataSet = DataSet.fromJson({scenarioId: 'META', dataSetName: 'tools', tables: {ProjectToolCatalog: config.tables.ProjectToolCatalog, ProjectToolFile: config.tables.ProjectToolFile}})
  instances.push(dataSet)
  const resource = new ProjectToolResource({workspace, metadataScenarioId: 'META', assertCurrent: () => {if (!current) throw new Error('scope expired')}, ...(blueprintTreeProjection ? {blueprintTreeProjection} : {})})
  for (const table of Object.values(dataSet.tables)) for (const view of table.viewList) view.bindQueryExecutor(resource, {resource: {resourceType: 'file', resourceId: table.resourceId!}})
  const view = dataSet.getView('ProjectToolFile')!
  view.queryContext = {pageId: 'ONE', fileName: 'rule.json', versionId: ''}
  return {dataSet, view, files, writes, workspace, resource, expire() {current = false}, lose() {lose = true}, block(value: Promise<void>) {block = value}}
}

describe('project tool resources on native data views', () => {
  it('queries a unique blueprint inventory and preserves all published pointers without editing the blueprint', async () => {
    const f = fixture(), view = f.dataSet.getView('ProjectToolCatalog')!
    await view.refresh()
    expect(view.rows).toMatchObject([{pageId: 'ONE', versions: ['v1', 'v2']}]); expect(view.total).toBe(1)
    expect(view.editActionState(view.rows[0]!)).toBe('disabled'); expect(view.addActionState()).toBe('disabled')
    expect(f.workspace.getActivePageTool()).toBeNull(); expect(f.writes).toEqual([])
  })

  it('projects the catalog only from an injected formal navigation DataView tree owner', async () => {
    const tree: ProjectBlueprintTreeData = {nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:[
      {nodeId:'ONE',parentNodeId:'ROOT',projectId:'APP',kind:'page',capability:{name:'One'},source:{VersionId:'v1'},navigation:{target:'cfg:ONE',title:'One',order:0,publishInMenu:true,showChildren:true,beginGroup:false},children:[]},
    ]}
    const projection = vi.fn(() => tree)
    const f = fixture(projection), view = f.dataSet.getView('ProjectToolCatalog')!
    await view.refresh()
    expect(view.rows).toMatchObject([{pageId:'ONE',versions:['v1']}])
    expect(projection).toHaveBeenCalledOnce()
  })

  it('fails closed when the formal navigation tree owner is not injected', async () => {
    const f = fixture(null), view = f.dataSet.getView('ProjectToolCatalog')!
    await expect(view.loadFromServer()).rejects.toThrow('PROJECT_TOOL_CATALOG_OWNER')
  })

  it('rejects a tree projection completed after the host generation expires', async () => {
    let release!: (tree: ProjectBlueprintTreeData) => void
    const pending = new Promise<ProjectBlueprintTreeData>(resolve => {release = resolve})
    const projection = vi.fn(() => pending)
    const f = fixture(projection), view = f.dataSet.getView('ProjectToolCatalog')!
    const query = view.loadFromServer({singleFlight:false})
    f.expire()
    release({nodeId:'ROOT',parentNodeId:'',projectId:'APP',kind:'module',capability:{name:'App'},source:{},children:[]})
    await expect(query).rejects.toThrow('scope expired')
    expect(projection).toHaveBeenCalledOnce()
    expect(view.rows).toEqual([])
  })

  it('cancels and saves through the same view, preserving the other files and reopening persisted content', async () => {
    const f = fixture(); await f.view.refresh()
    const key = f.view.getPkKey(f.view.rows[0]!)!
    f.view.updateEditingValue(key, 'text', '{"type":"r-section"}')
    f.view.discardPendingChanges()
    expect(f.view.getEditingRow(key)?.['text']).toBe('{"type":"r-text"}'); expect(f.writes).toEqual([])
    f.view.updateEditingValue(key, 'text', '{"type":"r-section"}')
    expect((await f.dataSet.saveChanges()).success).toBe(true)
    expect(f.writes).toEqual(['{"type":"r-section"}']); expect(f.files.get('ONE/v1/rule.json')).toBe('{"type":"r-button"}')
    const fresh = f.view.createQueryView('reopened'); await fresh.refresh()
    expect(fresh.rows[0]?.['text']).toBe('{"type":"r-section"}'); expect(f.view.hasEditingChanges()).toBe(false)
  })

  it('confirms a lost reply through the same save API without replaying the write', async () => {
    const f = fixture(); await f.view.refresh()
    f.view.updateEditingValue(f.view.getPkKey(f.view.rows[0]!)!, 'text', '{"type":"r-section"}'); f.lose()
    await expect(f.dataSet.saveChanges()).rejects.toThrow('reply lost')
    expect(f.view.dirtyTracking.hasPendingChanges()).toBe(true)
    expect((await f.dataSet.saveChanges()).success).toBe(true); expect(f.writes).toHaveLength(1)
  })

  it('rejects concurrent remote text and preserves the captured DataView changes', async () => {
    const f = fixture(); await f.view.refresh()
    const key = f.view.getPkKey(f.view.rows[0]!)!
    f.view.updateEditingValue(key, 'text', '{"type":"r-section"}')
    f.files.set('ONE//rule.json', '{"type":"r-form"}')
    await expect(f.dataSet.saveChanges()).rejects.toThrow('CONFLICT'); expect(f.writes).toEqual([])
    expect(f.view.getEditingRow(key)?.['text']).toBe('{"type":"r-section"}')
  })

  it('keeps published snapshots immutable and identities noneditable', async () => {
    const f = fixture(); f.view.queryContext = {pageId: 'ONE', fileName: 'rule.json', versionId: 'v1'}
    await f.view.refresh()
    const row = f.view.rows[0]!
    expect(f.view.fieldAccess(row, 'text').write).toBe('denied'); expect(f.view.editActionState(row)).toBe('disabled')
    expect(f.view.fieldAccess(row, 'pageId').write).toBe('denied'); expect(f.view.deleteActionState(row)).toBe('disabled')
    f.view.updateEditingValue(f.view.getPkKey(row)!, 'text', 'changed')
    await expect(f.dataSet.saveChanges()).rejects.toThrow()
    expect(f.files.get('ONE/v1/rule.json')).toBe('{"type":"r-button"}')
    expect(f.writes).toEqual([])
  })

  it.each([{pageId: '../ONE'}, {fileName: '../rule.json'}, {versionId: 'v/1'}, {pageId: ''}])('rejects unsafe query identity before file IO: %j', async invalid => {
    const f = fixture(), read = vi.spyOn(f.workspace, 'previewPageFileRemote')
    f.view.queryContext = {...f.view.queryContext, ...invalid}
    await expect(f.view.loadFromServer()).rejects.toThrow('PROJECT_TOOL_TARGET'); expect(read).not.toHaveBeenCalled()
  })

  it('keeps existing rows on read failure and rejects a result from an expired scope', async () => {
    const f = fixture(); await f.view.refresh()
    f.files.delete('ONE//rule.json')
    await expect(f.view.loadFromServer()).rejects.toThrow('file missing'); expect(f.view.rows[0]?.['text']).toBe('{"type":"r-text"}')
    f.files.set('ONE//rule.json', '{"type":"r-section"}')
    let release!: () => void; f.block(new Promise(resolve => {release = resolve}))
    const query = f.view.loadFromServer({singleFlight: false}); f.expire(); release()
    await expect(query).rejects.toThrow('scope expired'); expect(f.view.rows[0]?.['text']).toBe('{"type":"r-text"}')
  })
})
