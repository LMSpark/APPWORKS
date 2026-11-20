import {readFile} from 'node:fs/promises'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {workflowDesignModels,workflowDesignCommandBindings} from './workflow-native-design.fixture'
import {createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout/layout-resource'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
const SCENE='0DD8D28D462F51C5790AA6FBFAE39366'
const pages: PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
describe('workflow formal design DataSet',()=>{
  it('rejects the projected owner if the formal service model no longer outputs it',async()=>{
    const text=await readFile('config/pages/structured-config/workflow-editor/pagedata.json','utf8')
    const http=new ApiBackend(),api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
    expect(()=>new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(SCENE,text),...workflowDesignCommandBindings(text,http),space:{dataSpaceId:SCENE,name:'工作流设计'},models:workflowDesignModels(false),relations:[],fileExecutors:{WorkflowLayout:createWorkflowLayoutExecutor({api:{removeFile:async()=>{throw Error('unexpected layout delete')},readTextFile:async()=>{throw new LowcodeApiError(404,'missing')}},fileUpload:{uploadWorkingText:async()=>{throw new Error('unexpected upload')}},assertCurrent:()=>{}})}})).toThrow('queryConfig.fields 不是当前正式输出字段: workflow_id')
    expect(http.reads).toEqual([]);expect(http.saves).toEqual([])
  })
  it('projects the repaired node owner and keeps native create, cancel and save inside the target workflow',async()=>{
    const text=await readFile('config/pages/structured-config/workflow-editor/pagedata.json','utf8')
    const models=workflowDesignModels()
    const http=new ApiBackend()
    http.records={Base_WorkflowDefinition:[{rowid:'W1'},{rowid:'W2'}],Base_WorkflowNodeDefinition:[{rowid:'N1',workflow_id:'W1',name:'当前节点'},{rowid:'N2',workflow_id:'W2',name:'其他节点'}]}
    const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
    const ds=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(SCENE,text),...workflowDesignCommandBindings(text,http),space:{dataSpaceId:SCENE,name:'工作流设计'},models,relations:[],fileExecutors:{WorkflowLayout:createWorkflowLayoutExecutor({api:{removeFile:async()=>{throw Error('unexpected layout delete')},readTextFile:async()=>{throw new LowcodeApiError(404,'missing')}},fileUpload:{uploadWorkingText:async()=>{throw new Error('unexpected upload')}},assertCurrent:()=>{}})}}).dataSet
    const page=new PageRuntime({pageId:'workflow-owner',scenarioIds:[SCENE],scenarioInputs:{[SCENE]:{workflowId:'W1'}},loadScenario:async()=>ds});pages.push(page)
    await page.load();ds.triggerAutoLoad()
    const nodes=ds.getView('Base_WorkflowNodeDefinition')!
    await vi.waitFor(()=>expect(nodes.requestState).toBe(RequestState.Loaded))
    expect(nodes.rows.map(row=>[row['rowid'],row['workflow_id']])).toEqual([['N1','W1']])
    expect(nodes.newRowFieldAccess('workflow_id').write).toBe('allowed')
    await nodes.addRow({name:'取消的节点',node_type:'query'})
    expect(nodes.rows.find(row=>row['name']==='取消的节点')?.['workflow_id']).toBe('W1')
    nodes.discardPendingChanges()
    expect(nodes.rows.map(row=>row['rowid'])).toEqual(['N1']);expect(http.saves).toEqual([])
    await nodes.addRow({name:'保存的节点',node_type:'query'})
    expect((await ds.saveChanges({views:[{tableName:'Base_WorkflowNodeDefinition',viewId:'default'}]})).success).toBe(true)
    expect(http.saves[0]?.added).toEqual([expect.objectContaining({workflow_id:'W1',name:'保存的节点'})])
    await nodes.refresh()
    expect(nodes.rows.every(row=>row['workflow_id']==='W1')).toBe(true)
    expect(http.records['Base_WorkflowNodeDefinition']?.find(row=>row['rowid']==='N2')).toEqual({rowid:'N2',workflow_id:'W2',name:'其他节点'})
    http.denyAdd.add('Base_WorkflowNodeDefinition');await nodes.refresh()
    expect(nodes.addActionState()).toBe('hidden')
    await expect(nodes.addRow({name:'禁止新增',node_type:'query'})).rejects.toThrow()
    expect(http.saves).toHaveLength(1)
  })
  it('queries only the target workflow even when the node ownership field is not output, then saves and cancels through native views',async()=>{
    // Historical configuration before the output repair must still reject explicit owner writes.
    const config=JSON.parse(await readFile('config/pages/structured-config/workflow-editor/pagedata.json','utf8'))
    delete config.tables.Base_WorkflowNodeDefinition.views.start
    config.tables.Base_WorkflowNodeDefinition.views.default.queryConfig.fields=config.tables.Base_WorkflowNodeDefinition.views.default.queryConfig.fields.filter((field:string)=>field!=='workflow_id')
    const text=JSON.stringify(config)
    const models=workflowDesignModels(false)
    const http=new ApiBackend()
    http.records={Base_WorkflowDefinition:[{rowid:'W1',name:'当前流程'},{rowid:'W2',name:'其他流程'}],Base_WorkflowNodeDefinition:[{rowid:'N1',workflow_id:'W1',name:'当前节点',node_type:'query'},{rowid:'N2',workflow_id:'W2',name:'其他节点'}],Base_WorkflowConnectors:[{rowid:'E1',workflow_id:'W1',sourceID:'N1',targetID:'N1'},{rowid:'E2',workflow_id:'W2',sourceID:'N2',targetID:'N2'}]}
    const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
    const assembled=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(SCENE,text),...workflowDesignCommandBindings(text,http),space:{dataSpaceId:SCENE,name:'工作流设计'},models,relations:[],fileExecutors:{WorkflowLayout:createWorkflowLayoutExecutor({api:{removeFile:async()=>{throw Error('unexpected layout delete')},readTextFile:async()=>{throw new LowcodeApiError(404,'missing')}},fileUpload:{uploadWorkingText:async()=>{throw new Error('unexpected upload')}},assertCurrent:()=>{}})}})
    expect(assembled.diagnostics).toEqual([])
    const ds=assembled.dataSet
    const page=new PageRuntime({pageId:'workflow-test',scenarioIds:[SCENE],scenarioInputs:{[SCENE]:{workflowId:'W1'}},loadScenario:async()=>ds});pages.push(page)
    await page.load();ds.triggerAutoLoad()
    const nodes=ds.getView('Base_WorkflowNodeDefinition')!,edges=ds.getView('Base_WorkflowConnectors')!
    await vi.waitFor(()=>{expect(nodes.requestState).toBe(RequestState.Loaded);expect(edges.requestState).toBe(RequestState.Loaded)})
    expect(nodes.rows.map(r=>r['rowid'])).toEqual(['N1']);expect(edges.rows.map(r=>r['rowid'])).toEqual(['E1'])
    nodes.updateEditingValue('N1','name','修改节点');edges.updateEditingValue('E1','name','未保存连线')
    expect((await ds.saveChanges({views:[{tableName:'Base_WorkflowNodeDefinition',viewId:'default'}]})).success).toBe(true)
    expect(http.saves.map(s=>s.table)).toEqual(['Base_WorkflowNodeDefinition'])
    edges.discardPendingChanges();expect(edges.hasEditingChanges()).toBe(false)
    await expect(nodes.addRow({name:'新增节点',node_type:'query',workflow_id:'W1'})).rejects.toThrow('DATA_VIEW_NEW_ROW_FIELD_UNKNOWN: workflow_id')
    expect(http.records['Base_WorkflowNodeDefinition']?.find(r=>r['rowid']==='N2')?.['name']).toBe('其他节点')
  })
})
