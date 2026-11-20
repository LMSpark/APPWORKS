import {expect,it} from 'vitest'
import {DataSet,bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {HttpClientBase,type RequestConfig,type HttpResponse} from '@spark-appworks/spark-utils'
import {PdfInspectionApi} from './task-api'
import {pdfInspectionReadonlyBinding} from './readonly-resources'
class Http extends HttpClientBase{
 calls=0
 protected async executeRequest(_config:RequestConfig):Promise<HttpResponse<unknown>>{this.calls++;return{data:{Code:200,Result:{page:2,pageSize:1,total:7,items:[{inspectJobId:'JOB',requestId:'REQ',configId:'RULE',status:'COMPLETED'}]}},status:200,statusText:'OK',headers:{}}}
}
function fixture(){
 const ds=DataSet.fromJson({scenarioId:'PDF',tables:{History:{resourceType:'logical-view',resourceId:'pdf-inspect:history',columns:['inspectJobId','requestId','configId','status'].map(name=>({name,type:'string',isPrimaryKey:name==='inspectJobId'})),views:{default:{autoLoad:false,commitMode:'staged'}}}}})
 const http=new Http(),api=new PdfInspectionApi({http,readScope:()=>({token:'scope',headers:{'X-AppId':'APP'}})}),view=ds.getView('History')!
 bindDataSetReadonlyCommandQuery(view,pdfInspectionReadonlyBinding({api,kind:'history',assertCurrent:()=>{}}));view.page=2;view.pageSize=1
 return{ds,view,http}
}
it('binds the exact server page and preserves its authoritative total',async()=>{
 const f=fixture();await f.view.refresh();expect(f.view.loadingError).toBeNull();expect(f.view.rows).toHaveLength(1);expect(f.view.total).toBe(7);expect(f.http.calls).toBe(1);f.ds.destroy()
})
it('rejects a history filter before HTTP instead of ignoring it',async()=>{
 const f=fixture();f.view.filterExpression={field:'status',operator:'eq',value:'COMPLETED'};await f.view.refresh();expect(f.view.loadingError).toBeDefined();expect(f.http.calls).toBe(0);f.ds.destroy()
})
