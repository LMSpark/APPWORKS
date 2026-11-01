import {readFile} from 'node:fs/promises'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {RequestState} from '@spark-appworks/spark-data'
import {PageRuntime, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../../api-provider/api-provider.fixture'
import {workflowDesignModels} from './workflow-native-design.fixture'
import {createWorkflowLayoutExecutor} from '@/lowcode/resources/structured-config/workflow-definition/layout-resource'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
const SCENE='0DD8D28D462F51C5790AA6FBFAE39366'
const pages: PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
describe('workflow formal design DataSet',()=>{
  it('queries only the target workflow even when the node ownership field is not output, then saves and cancels through native views',async()=>{
    const text=await readFile('config/pages/structured-config/workflow-editor/pagedata.json','utf8')
    const models=workflowDesignModels()
    const http=new ApiBackend()
    http.records={Base_WorkflowDefinition:[{rowid:'W1',name:'当前流程'},{rowid:'W2',name:'其他流程'}],Base_WorkflowNodeDefinition:[{rowid:'N1',workflow_id:'W1',name:'当前节点',node_type:'query'},{rowid:'N2',workflow_id:'W2',name:'其他节点'}],Base_WorkflowConnectors:[{rowid:'E1',workflow_id:'W1',sourceID:'N1',targetID:'N1'},{rowid:'E2',workflow_id:'W2',sourceID:'N2',targetID:'N2'}]}
    const api=new DataSpaceRuntimeApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})})
    const assembled=new LowcodeDataSpaceAssembler(api,http).assemble({config:new ScenarioViewConfig(SCENE,text),space:{dataSpaceId:SCENE,name:'工作流设计'},models,relations:[],fileExecutors:{WorkflowLayout:createWorkflowLayoutExecutor({api:{readTextFile:async()=>{throw new LowcodeApiError(404,'missing')}},fileUpload:{uploadWorkingText:async()=>{throw new Error('unexpected upload')}},assertCurrent:()=>{}})}})
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
