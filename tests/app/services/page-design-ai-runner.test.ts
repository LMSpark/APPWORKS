import {beforeEach,describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {ProjectWorkspace,type PageToolFileName} from '@spark-appworks/spark-project-model'
import type {AiRunAdapterState,AiRunSnapshot} from '@spark-appworks/spark-app'
import type {AiAgentHost} from '@spark-appworks/spark-ai/agent'
import {runPageDesignAiSession} from '@/services/page-design/page-design-ai-runner'
import {createPageFileResourceView} from '@/services/project/page-tool-file-dataview'

const storage=vi.hoisted(()=>({files:new Map<string,string>()}))
vi.mock('@/lowcode/lowcode-runtime',()=>({
  createPageToolFilesIo:()=>({
    list:async()=>[],
    read:async(appId:string,pageId:string,fileName:string)=>storage.files.get(`${appId}/${pageId}/${fileName}`)??null,
    upload:async(input:{appId:string;pageId:string;fileName:string;text:string})=>{storage.files.set(`${input.appId}/${input.pageId}/${input.fileName}`,input.text)},
    remove:async(appId:string,pageId:string,fileName:string)=>{storage.files.delete(`${appId}/${pageId}/${fileName}`)},
    listVersions:async()=>[],uploadVersion:async()=>{},readVersion:async()=>null,
  }),
}))

vi.mock('@/services/ai/agent-workflow-bindings',async importOriginal=>{
  const actual=await importOriginal<typeof import('@/services/ai/agent-workflow-bindings')>()
  return {...actual,activatePageDesignAgentWorkflow:vi.fn(async(options:{host:AiAgentHost})=>options.host)}
})

function createEditor():ProjectWorkspace{
  const editor=new ProjectWorkspace({projectId:'demo',blueprint:{}})
  editor.project.replaceBlueprintTree({nodeId:'root',parentNodeId:'',projectId:'demo',kind:'module',capability:{name:'Root',description:'项目需求'},source:{},children:[
    {nodeId:'orders',parentNodeId:'root',projectId:'demo',kind:'page',capability:{name:'订单',description:'订单列表页面'},
      navigation:{title:'订单',target:'cfg:orders',order:0,publishInMenu:true,showChildren:false,beginGroup:false},source:{implGate:'open',upstreamContractsSatisfied:true}},
  ]})
  editor.project.openPageDesign('orders')
  editor.project.setActivePage('orders')
  editor.project.markPageLoadedChanged('orders',true)
  return editor
}

function createDataSet():DataSet{
  return DataSet.fromJson({scenarioId:'META',tables:{ProjectToolFile:{resourceType:'file',resourceId:'project:tool-file',
    columns:[{name:'fileKey',type:'string',isPrimaryKey:true},{name:'pageId',type:'string'},{name:'fileName',type:'string'},
      {name:'versionId',type:'string'},{name:'text',type:'string'},{name:'localDirty',type:'boolean'}],views:{default:{autoLoad:false}}}}})
}

async function bindScriptFile(editor:ProjectWorkspace){
  const dataSet=createDataSet(),fileName:PageToolFileName='script.js'
  storage.files.set('demo/orders/script.js','baseline')
  const view=createPageFileResourceView({dataSet,appId:'demo',pageId:'orders',fileName,workspace:editor,assertCurrent:()=>undefined})
  view.queryContext={...view.queryContext,appId:'demo'}
  await view.refresh()
  editor.project.findPageTool('orders')!.bindFileDataView(fileName,view)
  const row=view.currentRow,id=row&&view.getPkKey(row)
  if(!row||id===null||id===undefined)throw new Error('formal ProjectToolFile DataView returned no script row')
  const savePageFile=async(pageId:string,name:PageToolFileName,text:string):Promise<void>=>{
    const target=view.rows.find(candidate=>candidate['pageId']===pageId&&candidate['fileName']===name)
    const targetId=target&&view.getPkKey(target)
    if(!target||targetId===null||targetId===undefined)throw new Error('FileResource save target is missing')
    if(view.getEditingRow(targetId)?.['text']!==text)throw new Error('submitted file text differs from DataView edit overlay')
    const receipt=await dataSet.saveChanges({views:[{tableName:view.tableName,viewId:view.viewId,ids:[targetId]}]})
    if(!receipt.success)throw receipt.error??new Error(receipt.message)
  }
  return {dataSet,view,id,savePageFile}
}

function emptyAiRunSnapshot():AiRunSnapshot{
  return {trace:{streamText:'',reasoningText:'',isStreaming:false,isReasoning:false,entries:[],toolCalls:[]},agUiEvents:[],timeline:[]}
}
function createAdapter(run:AiRunAdapterState['run']):AiRunAdapterState{
  return {isRunning:vi.fn(()=>false),abort:vi.fn(),snapshot:vi.fn(emptyAiRunSnapshot),subscribe:vi.fn(()=>()=>{}),run}
}

describe('runPageDesignAiSession DataView editing',()=>{
  beforeEach(()=>storage.files.clear())

  it('keeps a real FileResource edit pending by default',async()=>{
    const editor=createEditor(),{dataSet,view,id}=await bindScriptFile(editor)
    try{
      const adapter=createAdapter(vi.fn(async()=>{editor.project.writePageFile({fileName:'script.js',text:'export default {}'});return 'completed' as const}))
      const result=await runPageDesignAiSession({pageId:'orders',description:'生成订单页',editor,adapter})
      expect(result.dirtyFileNames).toEqual(['script.js'])
      expect(result.savedDirtyFileNames).toEqual([])
      expect(view.getEditingRow(id)?.['text']).toBe('export default {}')
      expect(view.hasEditingChanges(id)).toBe(true)
      expect(storage.files.get('demo/orders/script.js')).toBe('baseline')
    }finally{dataSet.destroy();editor.dispose()}
  })

  it('auto delivery accepts the exact DataView receipt through FileResource',async()=>{
    const editor=createEditor(),{dataSet,view,id,savePageFile}=await bindScriptFile(editor)
    try{
      const adapter=createAdapter(vi.fn(async()=>{editor.project.writePageFile({fileName:'script.js',text:'export default {}'});return 'completed' as const}))
      const result=await runPageDesignAiSession({pageId:'orders',description:'生成订单页',editor,adapter,saveDirtyFilesAfterRun:true,savePageFile})
      expect(result.savedDirtyFileNames).toEqual(['script.js'])
      expect(result.dirtyFileNames).toEqual([])
      expect(view.hasEditingChanges(id)).toBe(false)
      expect(storage.files.get('demo/orders/script.js')).toBe('export default {}')
    }finally{dataSet.destroy();editor.dispose()}
  })

  it('keeps a real DataView edit pending when the inline run fails',async()=>{
    const editor=createEditor(),{dataSet,view,id}=await bindScriptFile(editor)
    try{
      const adapter=createAdapter(vi.fn(async()=>{editor.project.writePageFile({fileName:'script.js',text:'export default {}'});throw new Error('run failed')}))
      await expect(runPageDesignAiSession({pageId:'orders',description:'生成订单页',editor,adapter})).rejects.toThrow('run failed')
      expect(view.hasEditingChanges(id)).toBe(true)
      expect(view.getEditingRow(id)?.['text']).toBe('export default {}')
      expect(storage.files.get('demo/orders/script.js')).toBe('baseline')
    }finally{dataSet.destroy();editor.dispose()}
  })
})
