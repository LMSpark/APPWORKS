import {expect,it} from 'vitest'
import {DataSpaceRuntimeApi,PdfInspectionApi,pdfInspectionReadonlyBinding} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {HttpClientBase,type RequestConfig,type HttpResponse} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'

class HistoryHttp extends HttpClientBase{
 calls:RequestConfig[]=[]
 protected override async executeRequest(config:RequestConfig):Promise<HttpResponse<unknown>>{
  this.calls.push(config)
  expect(config.url).toContain('/api/File/inspect/history')
  expect(config.data).toEqual({page:2,pageSize:1})
  return{data:{Code:200,Result:{page:2,pageSize:1,total:7,items:[{inspectJobId:'JOB',requestId:'REQ',configId:'RULE',status:'COMPLETED'}]}},status:200,statusText:'OK',headers:{}}
 }
}

it('loads PDF history through the formal scenario assembler and the exported readonly binding',async()=>{
 const config=new ScenarioViewConfig('PDF',JSON.stringify({scenarioId:'PDF',tables:{History:{resourceType:'logical-view',resourceId:'pdf-inspect:history',columns:['inspectJobId','requestId','configId','status'].map(name=>({name,type:'string',isPrimaryKey:name==='inspectJobId'})),views:{default:{autoLoad:false,page:2,pageSize:1,commitMode:'staged',queryConfig:{pagination:'paged'}}}}}}))
 const http=new HistoryHttp(),readScope=()=>({token:'scope',headers:{'X-AppId':'APP'}})
 const api=new PdfInspectionApi({http,readScope}),runtime=new DataSpaceRuntimeApi({http,readScope})
 const {dataSet}=new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space:{dataSpaceId:'PDF',name:'PDF核验'},models:[],relations:[],projectionBindings:{History:()=>pdfInspectionReadonlyBinding({api,kind:'history',assertCurrent:()=>{}})}})
 try{
  const view=dataSet.getView('History')!
  await view.refresh()
  expect(view.loadingError).toBeNull();expect(view.rows).toMatchObject([{inspectJobId:'JOB',requestId:'REQ'}])
  expect(view.total).toBe(7);expect(http.calls).toHaveLength(1)
  expect(view.captureReadRow(view.rows[0]!,['inspectJobId','requestId'])).not.toThrow()
  expect(view.fieldAccess(view.rows[0]!,'status').write).toBe('denied')
 }finally{dataSet.destroy()}
})
