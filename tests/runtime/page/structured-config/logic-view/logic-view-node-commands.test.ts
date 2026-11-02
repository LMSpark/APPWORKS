import {afterEach,describe,expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {LogicViewNodeCommands} from '@/lowcode/resources/structured-config/logic-view/node-commands'
import {logicFieldRowAdapter} from '@/lowcode/resources/structured-config/logic-view/field-row-adapter'
import {attachStagedDesignView,setDesignScopeValue} from '@/lowcode/resources/repository/staged-design-file-view'
import type {PageDataSpaceModelSourcePrepared} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'
const sets:DataSet[]=[]
afterEach(()=>sets.splice(0).forEach(ds=>ds.destroy()))
const prepared:PageDataSpaceModelSourcePrepared={source:{type:'table',id:'T',name:'Orders',description:'订单',dbid:'DB',databaseName:'Business',providerId:''},
  model:{Type:'数据库表',MetaName:'Orders',description:'订单',DbId:'DB',DbName:'Business',JoinType:'',ForeignKeyFields:'',JoinFilter:'',PId:''},
  fields:[{type:'dataModel',Name:'id',description:'编号',FieldType:'varchar',IsPKey:1,IsOutput:0,AsName:'',ValueFun:'',Expression:'',allowAIAdd:0,OrderType:'',Order:0,Group:0}]}
async function fixture(){
  const ds=DataSet.fromJson({scenarioId:'S',tables:{}});sets.push(ds)
  const original=[{Name:'Orders',extra:{keep:0},ChildTables:[{Name:'Lines',unknown:false,ChildTables:[]}]},{Name:'Other',ChildTables:[]}]
  const persist=vi.fn(),permission={allowed:true},active={value:true}
  const view=attachStagedDesignView(ds,{scopeInputTable:'Input',scopeField:'viewId',designViewTable:'Design',resourceId:'logic-design',
    columns:[{name:'rowid',primary:true},{name:'viewId'},{name:'designJson'}],jsonFields:['designJson'],editing:{fields:['designJson'],allowed:()=>permission.allowed},
    loadRow:async()=>({rowid:'V',viewId:'V',designJson:JSON.stringify(original)}),persistRow:persist},()=>{})
  setDesignScopeValue({dataSet:ds,tableName:'Input',field:'viewId',scopeId:'V'});await view.refresh()
  const commands=new LogicViewNodeCommands({view,assertCurrent:()=>{if(!active.value)throw Error('STALE')}})
  const read=()=>JSON.parse(String(view.getEditingRow('V')?.['designJson']??view.rows[0]?.['designJson']))
  return {ds,view,commands,original,persist,permission,active,read}
}
describe('original logic design node commands',()=>{
  it('projects known flag representations and preserves untouched or unknown source values',()=>{
    const original={Name:'id',IsOutput:true,IsPKey:'0',DISTINCT:1,extra:{keep:0}}
    const projected=logicFieldRowAdapter.read(original)
    expect(projected).toMatchObject({IsOutput:1,IsPKey:0,DISTINCT:1})
    expect(logicFieldRowAdapter.write(projected,original)).toEqual(original)
    expect(logicFieldRowAdapter.write({...projected,IsOutput:0,IsPKey:1},original)).toEqual({...original,IsOutput:false,IsPKey:'1'})
    expect(logicFieldRowAdapter.write({Name:'x'},{Name:'x'})).toEqual({Name:'x'})
    expect(logicFieldRowAdapter.read({Group:'unknown'})).toEqual({Group:'unknown'})
  })
  it('changes only selected-node output flags and keeps original cancellation and stale-target guards',async()=>{
    const f=await fixture()
    const fields=[{Name:'id',IsOutput:1,extra:false},{Name:'CreateTime',IsOutput:1},{Name:'amount',IsOutput:0},{Name:'description',IsOutput:'1'}]
    const original=[{...f.original[0],Fields:fields},f.original[1]]
    f.view.updateEditingValue('V','designJson',JSON.stringify(original))
    const stale=f.commands.capture()
    f.commands.setFieldOutput({expected:stale,path:[0],operation:'system-off'})
    expect(f.read()[0].Fields).toEqual([{Name:'id',IsOutput:1,extra:false},{Name:'CreateTime',IsOutput:0},{Name:'amount',IsOutput:0},{Name:'description',IsOutput:0}])
    expect(()=>f.commands.setFieldOutput({expected:stale,path:[0],operation:'reverse'})).toThrow(/变化/)
    f.commands.setFieldOutput({expected:f.commands.capture(),path:[0],operation:'reverse'})
    expect(f.read()[0].Fields.map((field:{IsOutput:number})=>field.IsOutput)).toEqual([0,1,1,1])
    f.commands.setFieldOutput({expected:f.commands.capture(),path:[0],operation:'all-off'})
    expect(f.read()[0].Fields.map((field:{IsOutput:number})=>field.IsOutput)).toEqual([0,0,0,0])
    expect(f.read()[0].ChildTables).toEqual(f.original[0]!.ChildTables);expect(f.read()[1]).toEqual(f.original[1])
    expect(f.persist).not.toHaveBeenCalled();f.view.discardPendingChanges();expect(f.read()).toEqual(f.original)
  })
  it('rejects an arbitrary JSON member path instead of adding a node outside the logical tree',async()=>{
    const f=await fixture()
    expect(()=>f.commands.append({expected:f.commands.capture(),parentPath:[0,'extra'],prepared})).toThrow(/节点路径/)
    expect(f.view.hasEditingChanges()).toBe(false);expect(f.read()).toEqual(f.original)
  })
  it('preserves compound source key flags without inventing a single-field join or deduplication key',async()=>{
    const f=await fixture(),compound={...prepared,fields:[...prepared.fields,{...prepared.fields[0]!,Name:'tenant'}]}
    f.commands.append({expected:f.commands.capture(),parentPath:null,prepared:compound})
    expect(f.read()[2]).toMatchObject({PrimaryKeyFields:'',Fields:[{Name:'id',IsPKey:1},{Name:'tenant',IsPKey:1}]})
  })
  it('appends a uniquely named child while preserving siblings and keeps the change cancellable without saving',async()=>{
    const f=await fixture(),before=f.commands.capture()
    expect(f.commands.append({expected:before,parentPath:[0],prepared})).toEqual([0,'ChildTables',1])
    const nodes=f.read()
    expect(nodes[0].extra).toEqual({keep:0});expect(nodes[0].ChildTables[0]).toEqual(f.original[0]!.ChildTables[0])
    expect(nodes[0].ChildTables[1]).toMatchObject({Name:'Orders_1',MetaName:'Orders',DbId:'DB',PrimaryKeyFields:'id',OutputType:'Table',Fields:[{Name:'id',IsOutput:1}],ChildTables:[]})
    expect(nodes[1]).toEqual(f.original[1]);expect(f.persist).not.toHaveBeenCalled()
    f.view.discardPendingChanges();expect(f.read()).toEqual(f.original)
  })
  it('removes only the captured subtree, returns its parent selection and can restore it through native cancellation',async()=>{
    const f=await fixture()
    expect(f.commands.remove({expected:f.commands.capture(),path:[0,'ChildTables',0]})).toEqual([0])
    expect(f.read()[0].ChildTables).toEqual([]);expect(f.read()[1]).toEqual(f.original[1])
    f.view.discardPendingChanges();expect(f.read()).toEqual(f.original);expect(f.persist).not.toHaveBeenCalled()
  })
  it('rejects a path captured before another edit instead of deleting the new occupant',async()=>{
    const f=await fixture(),expected=f.commands.capture()
    f.view.updateEditingValue('V','designJson',JSON.stringify([...f.original].reverse()))
    expect(()=>f.commands.remove({expected,path:[0]})).toThrow(/变化/)
    expect(f.read()[0].Name).toBe('Other')
  })
  it('requires current file permission and active workspace before touching the original field',async()=>{
    const f=await fixture(),expected=f.commands.capture();f.permission.allowed=false
    expect(()=>f.commands.append({expected,parentPath:null,prepared})).toThrow(/编辑/)
    f.permission.allowed=true;f.active.value=false
    expect(()=>f.commands.remove({expected,path:[0]})).toThrow('STALE')
    expect(f.view.hasEditingChanges()).toBe(false)
  })
})
