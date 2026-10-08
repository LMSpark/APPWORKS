import fs from 'node:fs'
import {createServer} from 'vite'
for (const key of ['log','info','debug','warn','error']) console[key] = () => {}
const appId = 'D99A1DCE9894698799101EFD70F8FC76'
const metadataId = '8D1AB14DD8277F3E7017CD38F77B09FD'
const targetId = '97DCB03F75AADEAE6B102B062DB71CEA'
const report = {at:new Date().toISOString(), stage:'initialize', writes:0, headers:[]}
let server
function check(value,message) { if (!value) throw new Error(message) }
try {
 const auth = JSON.parse(fs.readFileSync(0,'utf8').replace(/^\uFEFF/,''))
 const storage = new Map()
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}})
 server = await createServer({configFile:'vitest.config.ts',logLevel:'silent',server:{middlewareMode:true}})
 const {lowcodeApi:api,lowcodeHttp:http} = await server.ssrLoadModule('/src/lowcode/lowcode-runtime.ts')
 const {DataViewFilter} = await server.ssrLoadModule('/packages/spark-data/src/index.ts')
 let loggedIn=false
 http.interceptors.request.use({onRequest:config=>{
  if (loggedIn) check(config.url==='/api/DataOperation/GetData','Unexpected non-read API')
  return {...config,baseURL:'http://127.0.0.1:5273'}
 }})
 report.stage='login'
 const enterprises=(await api.platform.listEnterprises()).filter(item=>item.name===auth.enterpriseName||item.shortName===auth.enterpriseName)
 check(enterprises.length===1,'Enterprise identity is not unique')
 auth.enterpriseName=enterprises[0].shortName
 await api.platform.login(auth)
 auth.password=''
 await api.platform.activateApplication(appId)
 loggedIn=true
 report.stage='explicit-name-projection'
 for (const dataSpaceId of [metadataId,targetId]) {
  const result=await api.dataSpace.runtime.query({scenarioId:metadataId,metaName:'Base_DataSet'},
   {fields:['rowid','Name'],filter:DataViewFilter.condition({field:'rowid',operator:'eq',value:dataSpaceId}),page:{index:1,size:2}})
  const row=result.rows[0]
  check(result.rows.length===1&&result.total===1&&row?.rowid===dataSpaceId,'Space identity not uniquely returned')
  check(result.readFieldAccess(row,'rowid')==='visible'&&result.readFieldAccess(row,'Name')==='visible','Space header not readable')
  check(typeof row.Name==='string'&&row.Name.trim(),'Missing formal space name')
  report.headers.push({dataSpaceId,name:row.Name,nameReadable:true,identityReadable:true})
 }
 report.stage='complete'
} catch(error) {
 report.failed=true
 report.error=String(error?.message??'').replace(/Bearer\s+\S+/gi,'[redacted]').replace(/eyJ[A-Za-z0-9_.-]+/g,'[redacted]').slice(0,200)
 process.exitCode=1
} finally {
 await server?.close()
 fs.writeFileSync(new URL('online-header-result.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
 process.stdout.write(JSON.stringify(report))
}
