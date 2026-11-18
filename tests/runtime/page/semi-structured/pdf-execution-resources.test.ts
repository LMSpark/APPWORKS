import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {DataSpaceRuntimeApi,LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {buildDataViewKey,resolveDataViewKey} from '@spark-appworks/spark-data'
import {HttpClientBase,type RequestConfig,type HttpResponse} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {createPdfInspectionProjectionBindings,PDF_INSPECTION_HISTORY_TABLE,PDF_INSPECTION_SCENARIO_ID} from '@/lowcode/resources/semi-structured/pdf-inspect/runtime-bindings'
import {capturePdfInspectionUpload,createPdfInspectionUploadBindings,PDF_INSPECTION_UPLOAD_TABLE,stagePdfInspectionFile} from '@/lowcode/resources/semi-structured/pdf-inspect/upload-command'

class HistoryHttp extends HttpClientBase{
 calls:RequestConfig[]=[]
 protected override async executeRequest(config:RequestConfig):Promise<HttpResponse<unknown>>{
  this.calls.push(config)
  expect(config.url).toContain('/api/File/inspect/history')
  expect(config.data).toEqual({page:2,pageSize:1})
  return{data:{Code:200,Result:{page:2,pageSize:1,total:7,items:[{inspectJobId:'JOB',requestId:'REQ',configId:'RULE',status:'COMPLETED'}]}},status:200,statusText:'OK',headers:{}}
 }
}

function assemble(table:string,http:HttpClientBase){
 const source=readFileSync('config/pages/semi-structured/pdf-inspect-catalog/pagedata.json','utf8')
 const config=new ScenarioViewConfig(PDF_INSPECTION_SCENARIO_ID,source).selectModelScope(table,[])
 const readScope=()=>({token:'scope',headers:{'X-AppId':'APP'}})
 const runtime=new DataSpaceRuntimeApi({http,readScope})
 const projectionBindings=createPdfInspectionProjectionBindings({config,http,readScope,assertCurrent:()=>{}})
 const commandBindings=createPdfInspectionUploadBindings({config,http,readScope,assertCurrent:()=>{}})
 return new LowcodeDataSpaceAssembler(runtime,http).assemble({config,space:{dataSpaceId:PDF_INSPECTION_SCENARIO_ID,name:'PDF核验'},models:[],relations:[],projectionBindings,commandBindings}).dataSet
}

it('stages an original File through the configured PDF command and saves that row only',async()=>{
 const dataSet=assemble(PDF_INSPECTION_UPLOAD_TABLE,new HistoryHttp())
 const file=new File(['%PDF-fixture'],'original.pdf')
 const upload=vi.spyOn(LowcodeDesignFileUpload.prototype,'uploadBinaryVersion').mockResolvedValue({
  templatePath:'/tenant/filedata/original.pdf',locator:{appType:'filedata',customPath:'',fileName:'original.pdf'},
 })
 const verify=vi.spyOn(LowcodeDesignFileUpload.prototype,'verifyBinaryVersion').mockResolvedValue(undefined)
 try{
  const view=dataSet.getView(PDF_INSPECTION_UPLOAD_TABLE)!
  await view.refresh()
  await expect(view.addRow({originalName:file.name,size:file.size})).rejects.toThrow('缺少本次原文件许可')
  const id=await stagePdfInspectionFile(dataSet,file,()=>{})
  expect(upload).not.toHaveBeenCalled()
  expect(view.dirtyTracking.isPendingCreate(id)).toBe(true)
  expect(()=>capturePdfInspectionUpload(dataSet,id)).toThrow('尚无确认回执')
  const saved=await dataSet.saveChanges({views:[{tableName:PDF_INSPECTION_UPLOAD_TABLE,viewId:'default',ids:[id]}]})
  expect(saved.success).toBe(true)
  expect(upload).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({file}))
  expect(verify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({file}))
  expect(view.rows).toMatchObject([{uploadId:id,filePath:'/tenant/filedata/original.pdf'}])
  const proof=capturePdfInspectionUpload(dataSet,id)
  expect(proof.input).toEqual({fileId:id,appType:'filedata',filePath:'/tenant/filedata/original.pdf'})
  await view.refresh()
  expect(proof.assertCurrent).toThrow()
 }finally{upload.mockRestore();verify.mockRestore();dataSet.destroy()}
})

it('loads PDF history through the formal scenario assembler and the exported readonly binding',async()=>{
 const http=new HistoryHttp()
 const dataSet=assemble(PDF_INSPECTION_HISTORY_TABLE,http)
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

it.each([
 {table:'PdfInspectionResult',endpoint:'result',context:{inspectJobId:'JOB'}},
 {table:'PdfInspectionRecovery',endpoint:'recover',context:{requestId:'REQ'}},
])('binds $endpoint to an exact original identity and keeps file evidence',async({table,endpoint,context})=>{
 const files=[{fileId:'FILE',rules:[{ruleId:'RULE',matched:false}]}]
 const http=new class extends HttpClientBase{
  calls=0
  protected override async executeRequest(config:RequestConfig):Promise<HttpResponse<unknown>>{
   this.calls++
   expect(config.url).toContain(`/api/File/inspect/${endpoint}`)
   expect(config.data).toEqual(context)
   return{data:{Code:200,Result:{protocolVersion:'2.0',inspectJobId:'JOB',requestId:'REQ',status:'COMPLETED',progress:{total:1,finished:1},files}},status:200,statusText:'OK',headers:{}}
  }
 }()
 const dataSet=assemble(table,http)
 try{
  const view=dataSet.getView(table)!
  await view.refresh()
  expect(view.loadingError).toBeTruthy()
  expect(http.calls).toBe(0)
  view.queryContext=context
  await view.refresh()
  expect(view.loadingError).toBeNull()
  expect(view.rows).toMatchObject([{status:'COMPLETED',files}])
  expect(http.calls).toBe(1)
 }finally{dataSet.destroy()}
})

it('reads limits from the service without sending a task identity',async()=>{
 const limits={protocolVersion:'2.0',maxFiles:4,maxFileBytes:1024,maxTotalFileBytes:4096,maxTotalSourceBytes:8192,
  maxZipBytes:4096,maxZipEntries:16,maxPages:32,maxTextCharsPerPage:512,maxRenderedPixels:4096}
 const http=new class extends HttpClientBase{
  protected override async executeRequest(config:RequestConfig):Promise<HttpResponse<unknown>>{
   expect(config.url).toContain('/api/File/inspect/limits')
   return{data:{Code:200,Result:limits},status:200,statusText:'OK',headers:{}}
  }
 }()
 const dataSet=assemble('PdfInspectionLimits',http)
 try{
  const view=dataSet.getView('PdfInspectionLimits')!
  await view.refresh()
  expect(view.loadingError).toBeNull()
  expect(view.rows).toMatchObject([{id:'limits',...limits}])
 }finally{dataSet.destroy()}
})
