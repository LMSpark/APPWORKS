import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {buildDataViewKey,resolveDataViewKey} from '@spark-appworks/spark-data'
import {HttpClientBase,type RequestConfig,type HttpResponse} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createPdfInspectionProjectionBindings,PDF_INSPECTION_HISTORY_TABLE,PDF_INSPECTION_SCENARIO_ID} from '@/lowcode/resources/semi-structured/pdf-inspect/runtime-bindings'

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
 const source=readFileSync('config/pages/semi-structured/pdf-inspect-catalog/pagedata.json','utf8')
 const config=new ScenarioViewConfig(PDF_INSPECTION_SCENARIO_ID,source).selectModelScope(PDF_INSPECTION_HISTORY_TABLE,[])
 const http=new HistoryHttp(),readScope=()=>({token:'scope',headers:{'X-AppId':'APP'}})
 const runtime=new DataSpaceRuntimeApi({http,readScope})
 const projectionBindings=createPdfInspectionProjectionBindings({config,http,readScope,assertCurrent:()=>{}})
 const {dataSet}=new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space:{dataSpaceId:PDF_INSPECTION_SCENARIO_ID,name:'PDF核验'},models:[],relations:[],projectionBindings})
 try{
  const view=dataSet.getView(PDF_INSPECTION_HISTORY_TABLE)!
  expect(resolveDataViewKey(buildDataViewKey(PDF_INSPECTION_HISTORY_TABLE,'default',PDF_INSPECTION_SCENARIO_ID),dataSet)).toBe(view)
  view.pageSize=1;view.page=2
  await view.refresh()
  expect(view.loadingError).toBeNull();expect(view.rows).toMatchObject([{inspectJobId:'JOB',requestId:'REQ'}])
  expect(view.total).toBe(7);expect(http.calls).toHaveLength(1)
  expect(view.captureReadRow(view.rows[0]!,['inspectJobId','requestId'])).not.toThrow()
  expect(view.fieldAccess(view.rows[0]!,'status').write).toBe('denied')
 }finally{dataSet.destroy()}
})
