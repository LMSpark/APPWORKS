import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
import {isDeepStrictEqual} from 'node:util'
import {createServer} from 'vite'

const APP = 'D99A1DCE9894698799101EFD70F8FC76'
const TENANT = 'NewApp'
const TARGET = '944DEE5A0E5170F903E0E008172C4CD2'
const PREFERRED_MODEL = 'SourceScope_20261018'
const root = process.cwd()
let stage = 'preflight'
let blockedMutations = 0

function stop(code) {
  const error = new Error(code)
  error.safeCode = code
  throw error
}
function assert(ok, code) { if (!ok) stop(code) }
function hash(text) { return createHash('sha256').update(text, 'utf8').digest('hex') }

function memoryStorage() {
  const values = new Map()
  return Object.freeze({
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => { values.set(String(key), String(value)) },
    removeItem: key => { values.delete(String(key)) },
  })
}
function installMemoryBrowserStorage() {
  const storage = memoryStorage()
  // lowcode-runtime passes window.sessionStorage into LowcodeApi at module load.
  // A process-local window shim keeps that existing constructor path intact in Node.
  globalThis.window = {sessionStorage: storage, location: {pathname: '/'}}
  globalThis.sessionStorage = storage
  globalThis.localStorage = storage
}
function installReadOnlyGuards(DataSet, DataView, LowcodeDesignFileUpload) {
  const deny = () => { blockedMutations++; return Promise.reject(Object.assign(new Error('READONLY_MUTATION_BLOCKED'), {safeCode: 'READONLY_MUTATION_BLOCKED'})) }
  DataSet.prototype.saveChanges = deny
  DataView.prototype.saveChanges = deny
  DataView.saveQueryViews = deny
  LowcodeDesignFileUpload.prototype.uploadWorkingText = deny
  LowcodeDesignFileUpload.prototype.uploadTextVersion = deny
}
function credential() {
  const ps = "$x=Import-Clixml 'C:\\Users\\lgf22\\AppData\\Local\\SPARK_AppWorks\\credentials\\newapp-test-admin.clixml'; $c=$x.Credential; if (-not $c) { throw 'Credential missing' }; [pscustomobject]@{TenantName=$x.TenantName; UserName=$c.UserName; Password=$c.GetNetworkCredential().Password} | ConvertTo-Json -Compress"
  const value = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
    {encoding: 'utf8', windowsHide: true}))
  assert(value.TenantName === TENANT, 'CREDENTIAL_TENANT_MISMATCH')
  return {enterpriseName: value.TenantName, account: value.UserName, password: value.Password}
}
function safeError(error) {
  const name = error && typeof error.name === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(error.name) ? error.name : 'Error'
  const code = error && typeof error.safeCode === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.safeCode) ? error.safeCode : 'RUNTIME_CONSUMPTION_FAILED'
  return {status: 'blocked', stage, errorType: name, safeCode: code}
}
function readViewConfig(view) { return JSON.stringify(view.toJson()) }
function unqueriedSnapshot(dataSet, selected) {
  const result = []
  for (const table of Object.values(dataSet.tables)) {
    for (const view of Object.values(table.views)) {
      if (view === selected) continue
      result.push({tableName: view.tableName, viewId: view.viewId, requestState: view.requestState,
        rowCount: view.rows.length, configHash: hash(readViewConfig(view))})
    }
  }
  return result.sort((a, b) => (a.tableName + '@' + a.viewId).localeCompare(b.tableName + '@' + b.viewId))
}


async function run() {
 installMemoryBrowserStorage()
 const server=await createServer({root,mode:'development',configFile:path.resolve(root,'vite.config.ts'),server:{middlewareMode:true},appType:'custom'})
 const requests=[]
 try {
  const {lowcodeApi,lowcodeHttp}=await server.ssrLoadModule('/src/lowcode/lowcode-runtime.ts')
  const {LowcodeDictionary}=await server.ssrLoadModule('/src/lowcode/resources/dictionary/lowcode-dictionary.ts')
  const {DataSet,DataView,DataViewFilter}=await server.ssrLoadModule('/packages/spark-data/src/index.ts')
  const apiModule=await server.ssrLoadModule('/packages/spark-lowcode-api/src/index.ts')
  installReadOnlyGuards(DataSet,DataView,apiModule.LowcodeDesignFileUpload)
  lowcodeHttp.interceptors.request.use({name:'readonly-b1-output-contract',onRequest:config=>{
   const url=new URL(config.url,'http://127.0.0.1:5273')
   assert(['/api/LoginAuthority/UserLoginByEnt','/api/DataOperation/GetData'].includes(url.pathname),'UNEXPECTED_REQUEST_BLOCKED')
   const data=typeof config.data==='string'?JSON.parse(config.data):config.data
   if(url.pathname.endsWith('/GetData')) requests.push({path:url.pathname,outputFieldMode:data?.OutputFieldMode,tables:data?.Table?.map(t=>({name:t.Name,filter:t.Filter,fields:t.Fields})),page:data?.PageParam})
   return {...config,baseURL:config.baseURL||'http://127.0.0.1:5273'}
  }})
  stage='login';await lowcodeApi.platform.login(credential());await lowcodeApi.platform.activateApplication(APP)
  const scope=lowcodeApi.readRequestScope()
  const formal=[]
  const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]))
  for(const [dataSpaceId,metaName] of [[LowcodeDictionary.editorScenarioId,'_Base_DictData'],['EDB0E34486FFB903E896E5C281230961','_Base_DictType']]) {
   stage='formal-model'
   const model=await lowcodeApi.dataSpace.design.readModel({designScenarioId:apiModule.DATA_SPACE_DESIGN_FORM_KEY,dataSpaceId,metaName,assertCurrent:()=>assert(lowcodeApi.readRequestScope().token===scope.token,'SCOPE_CHANGED')})
   formal.push({dataSpaceId,id:model.id,metaName,model:pick(model.raw,['Name','Type','MetaName','PrimaryKeyFields']),fields:model.fields.map(f=>({id:f.id,name:f.name,type:f.type,computed:f.computed,raw:pick(f.raw,['rowid','Name','AsName','FieldType','DefaultValue','defaultValue','IsOutput','IsPKey','ValueFun','Expression','allowAIAdd','AllowAIAdd','type','dataModelId','dataSetId'])}))})
  }
  stage='runtime-column-projection'
  const opened=await LowcodeDictionary.loadEditor(); const queryResults=[]
  try { const v=opened.dataSet.getView('_Base_DictData','default');assert(v,'ENTRY_VIEW_MISSING');
   queryResults.push({scenarioId:opened.dataSet.scenarioId,modelBinding:v.dataTable.modelBinding,requestState:v.requestState,tableColumns:v.dataTable.columns.map(c=>({name:c.name,hasAllowAIAdd:Object.hasOwn(c,'allowAIAdd'),allowAIAdd:c.allowAIAdd})),columns:v.columns.map(c=>({name:c.name,type:c.type,hasAllowAIAdd:Object.hasOwn(c,'allowAIAdd'),allowAIAdd:c.allowAIAdd}))});
  }finally{opened.dataSet.destroy()}
  assert(blockedMutations===0,'MUTATION_ATTEMPT')
  const proof={status:'confirmed',mode:'native-DataView-readonly',app:APP,formal,queryResults,requests,blockedMutations}
  const {writeFile}=await import('node:fs/promises')
  await writeFile(path.join(root,'node_modules/.cache/metadata-integration-20261024/g1-formal-runtime-live-read.json'),JSON.stringify(proof,null,2)+'\n')
  console.log(JSON.stringify({status:proof.status,modelFields:formal.map(m=>({id:m.id,fields:m.fields.length,flags:m.fields.map(f=>({name:f.name,id:f.id,allowAIAdd:f.raw.allowAIAdd,AllowAIAdd:f.raw.AllowAIAdd}))})),queries:queryResults,requestCount:requests.length,blockedMutations},null,2))
 } finally {await server.close()}
}
try{await run()}catch(error){console.log(JSON.stringify(safeError(error),null,2));process.exitCode=1}
