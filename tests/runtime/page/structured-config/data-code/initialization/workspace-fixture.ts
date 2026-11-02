import {fixture} from './fixture'
import {CodeInitializationWorkspace} from '@/lowcode/resources/structured-config/data-code/initialization-workspace'
export async function workspaceFixture(){
  const f=await fixture(),calls:Array<{date:string}>=[]
  f.service.http.records['Base_CodeSerialPerform']=[{rowid:'OLD',CodeDesignID:'C1',NodeDesignId:null,NodeCode:'A202611',Code:'003'}]
  const workspace=new CodeInitializationWorkspace({dataSet:f.ds,runtime:f.service.runtime,now:()=>new Date(2026,10,2),client:{read:async(input)=>{
    calls.push({date:input.date})
    const formatted=input.date.replaceAll('-','')
    const row=f.service.http.records['Base_CodeSerialPerform']!.find(row=>row['CodeDesignID']==='C1'&&row['NodeCode']===`A${formatted}`)
    return [{'1':'A','2':formatted,min:'001',max:'999',InitVal:row?.['Code']===null||row?.['Code']===undefined?'001':String(Number(row['Code'])+2).padStart(3,'0'),rowid:row?.['rowid']??null}]
  }}})
  return {...f,workspace,calls}
}
