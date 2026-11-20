import {afterEach,describe,expect,it} from 'vitest'
import {DataSet} from '../../dataset'
import type {DataView} from '../../data-view'

const dataSets:DataSet[]=[]
afterEach(()=>dataSets.splice(0).forEach(dataSet=>dataSet.destroy()))
async function fixture(){
 const dataSet=DataSet.fromJson({scenarioId:'SPACE',tables:{Records:{resourceType:'file',resourceId:'records',
  columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'text',type:'string'},{name:'payload',type:'json'},
   {name:'display',type:'string',computeExpression:'text + "!"'}],views:{default:{commitMode:'staged'}}}}})
 dataSets.push(dataSet)
 const view=dataSet.getView('Records')!
 let gate:Promise<void>|undefined,text='before'
 view.bindQueryExecutor({executeQuery:async()=>{
  await gate
  return{rows:[{id:'1',text,payload:{value:'original',optional:undefined}}],total:1,
   assertIdentity:()=>undefined,rowKey:(row:Readonly<Record<string,unknown>>)=>row['id'],
   fieldAccess:()=>({read:'visible' as const,write:'allowed' as const,component:'editable' as const,required:false,writeMode:'editable' as const}),
   readFieldAccess:()=> 'visible' as const,addActionState:()=> 'enabled' as const,editActionState:()=> 'enabled' as const,
   deleteActionState:()=> 'enabled' as const,createChildActionState:()=> 'enabled' as const,viewActionState:()=> 'enabled' as const}
 }},{resource:{resourceType:'file',resourceId:'records'}})
 await view.refresh()
 return{view,hold:(next:Promise<void>)=>{gate=next},remote:()=>{text='remote'}}
}
const mutations:Array<[string,(view:DataView)=>void]>=[
 ['primitive input',view=>{view.rows[0]!['text']='native input'}],
 ['nested input',view=>{(view.rows[0]!['payload'] as {value:string}).value='nested input'}],
 ['same-value replacement',view=>{view.rows.splice(0,1,{...view.rows[0]!})}],
 ['added native row',view=>{view.rows.push({id:'2',text:'added input'})}],
 ['undefined member removal',view=>{delete (view.rows[0]!['payload'] as {optional?:unknown}).optional}],
 ['new formal field input',view=>{view.dataTable!.addColumns([{name:'newInput',type:'string'}]);view.rows[0]!['newInput']='new field input'}],
 ['computed field becoming input',view=>{view.dataTable!.updateColumn('display',{computeExpression:''});view.rows[0]!['display']='now business input'}],
]
describe('query result replacement preserves native inputs',()=>{
 for(const phase of ['query','validator'] as const){
  it.each(mutations)(`rejects a response after %s during ${phase} waiting`,async(_name,mutate)=>{
   const {view,hold,remote}=await fixture()
   let release!:()=>void,entered!:()=>void
   const waiting=new Promise<void>(resolve=>{entered=resolve}),gate=new Promise<void>(resolve=>{release=resolve})
   if(phase==='query')hold(gate)
   else view.validateQueryResult=async()=>{entered();await gate}
   remote();const pending=view.loadFromServer()
   if(phase==='validator')await waiting
   mutate(view)
   const retained=view.rows.slice(),values=structuredClone(view.rows)
   release()
   await expect(pending).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
   expect(view.rows).toEqual(values)
   retained.forEach((row,index)=>expect(view.rows[index]).toBe(row))
  })
 }
 it('accepts a fresh result after only computation and selection change while loading',async()=>{
  const {view,hold,remote}=await fixture()
  let release!:()=>void
  hold(new Promise<void>(resolve=>{release=resolve}))
  remote();const pending=view.loadFromServer()
  view.rows[0]!['display']='temporary derived value'
  view.recomputeColumns();view.setCurrentRow(null)
  release()
  await expect(pending).resolves.toMatchObject({success:true})
  expect(view.rows[0]).toMatchObject({text:'remote',display:'remote!'})
 })
 it('accepts a fresh result after only column order and labels change while loading',async()=>{
  const {view,hold,remote}=await fixture()
  let release!:()=>void
  hold(new Promise<void>(resolve=>{release=resolve}))
  remote();const pending=view.loadFromServer()
  view.dataTable!.columns.reverse()
  view.dataTable!.updateColumn('text',{label:'Changed title'})
  release()
  await expect(pending).resolves.toMatchObject({success:true})
  expect(view.rows[0]?.['text']).toBe('remote')
 })
})
