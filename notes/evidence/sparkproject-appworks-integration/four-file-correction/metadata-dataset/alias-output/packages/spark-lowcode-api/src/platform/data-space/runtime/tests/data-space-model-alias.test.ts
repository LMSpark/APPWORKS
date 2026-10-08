import { describe, expect, it } from 'vitest'
import { DataSpaceQueryContext } from '../query/data-space-query-context'
import { DataSpaceQueryTable } from '../protocol/data-space-query-table'
import type { DataSpaceDesignApi } from '../../design/data-space-design-api'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
const model: FormalModel = {id:'MODEL', metaName:'Orders', name:'Orders', sourceName:'PhysicalOrders', sourceId:'RESOURCE',
  sourceType:'table', primaryKey:'orderId', businessMain:true, raw:{}, fields:[
    {id:'KEY',modelId:'MODEL',name:'rowid',canonicalName:'orderId',type:'string',primaryKey:true,description:'',output:true,computed:false,order:0,orderType:'',raw:{}},
    {id:'TITLE',modelId:'MODEL',name:'title',canonicalName:'caption',type:'string',primaryKey:false,description:'',output:true,computed:false,order:1,orderType:'',raw:{}},
  ]}
function fixture(formalModel: FormalModel = model) {
  const identity = {scenarioId:'SCENE',metaName:'Orders'}
  const context = new DataSpaceQueryContext({identity, scope:'scope',readScope:()=> 'scope',snapshot:new DataSpaceQueryTable(identity).applyResult({Result:{
    primaryKeyField:'rowid',allowAdd:true,lingma_sys_key:'add-signed',data:[{orderId:'A',caption:'before',lingma_sys_key:'original-signed',lingma_sys_params:{e:['caption'],r:['caption']}}],
  }})})
  context.bindFormalModel(formalModel)
  return context
}
describe('formal model alias query ownership', () => {
  it('addresses output identities and retains original signed token while mapping save fields to Name', () => {
    const context = fixture()
    expect(context.rowKey(context.rows[0] ?? {})).toBe('A')
    expect(context.fieldAccess('A','caption')).toMatchObject({write:'allowed',required:true})
    const changes = context.prepareSaveChanges({changed:[{orderId:'A',caption:'after',_pk:'local',lingma_sys_key:'forged'}]})
    expect(context.buildSaveRequest(changes)[0]?.CrudModel.Changed).toEqual([{rowid:'A',title:'after',lingma_sys_key:'original-signed'}])
    expect(context.rows).toEqual([{orderId:'A',caption:'before'}])
    const accepted = context.acceptSaveReceipt({requested:changes,receipt:{metaName:'Orders',added:[],changed:[{rowid:'A',title:'accepted'}],deleted:[]}})
    expect(accepted.changed).toEqual([{orderId:'A',caption:'accepted'}])
    expect(accepted.context.fieldAccess('A','caption').write).toBe('allowed')
    expect(accepted.context.rows).toEqual([{orderId:'A',caption:'accepted'}])
    expect(accepted.changedFields).toEqual([['orderId','caption']])
  })
  it('generates the formal output key and never submits a guessed business field or local _pk', () => {
    const context = fixture()
    const row = context.prepareNewRow({_pk:'local',caption:'new'})
    expect(row['orderId']).toMatch(/^[A-F0-9]{32}$/)
    expect(context.buildSaveRequest({added:[row]})[0]?.CrudModel.Added).toEqual([{rowid:row['orderId'],title:'new',lingma_sys_key:'add-signed'}])
    expect(()=>context.buildSaveRequest({added:[{orderId:'B',physicalGuess:1}]})).toThrow('MODEL_SAVE_FIELD')
  })

  it('saves and canonicalizes receipts through an equivalent repeated output record', () => {
    const caption = model.fields.find(field => field.canonicalName === 'caption')
    if (!caption) throw new Error('missing caption fixture')
    const repeated: FormalModel = { ...model, fields: [...model.fields, { ...caption, id: 'TITLE-DUP' }] }
    const context = fixture(repeated)
    const changes = context.prepareSaveChanges({ changed: [{ orderId: 'A', caption: 'after' }] })
    expect(context.buildSaveRequest(changes)[0]?.CrudModel.Changed)
      .toEqual([{ rowid: 'A', title: 'after', lingma_sys_key: 'original-signed' }])
    expect(context.resolveSaveReceipt({ requested: changes,
      receipt: { metaName: 'Orders', added: [], changed: [{ rowid: 'A', title: 'accepted' }], deleted: [] } }).changed)
      .toEqual([{ orderId: 'A', caption: 'accepted' }])
  })

  it('rejects receipt and ParentField source names that map to multiple output aliases', () => {
    const conflicting: FormalModel = { ...model, raw: { ParentField: 'parentId' }, fields: [...model.fields,
      { id: 'PARENT-A', modelId: 'MODEL', name: 'parentId', canonicalName: 'parentA', type: 'string',
        primaryKey: false, description: '', output: true, computed: false, order: 2, orderType: '', raw: {} },
      { id: 'PARENT-B', modelId: 'MODEL', name: 'parentId', canonicalName: 'parentB', type: 'string',
        primaryKey: false, description: '', output: true, computed: false, order: 3, orderType: '', raw: {} },
    ] }
    const context = fixture(conflicting)
    expect(() => context.buildSaveRequest({ added: [{ orderId: 'B', parentA: 'A' }] }))
      .toThrow('SPARK_CHILD_ADD_PARENT')
    expect(() => context.resolveSaveReceipt({ requested: { changed: [{ orderId: 'A', caption: 'after' }] },
      receipt: { metaName: 'Orders', added: [], changed: [{ rowid: 'A', title: 'accepted', parentId: 'P' }], deleted: [] } }))
      .toThrow('SPARK_MODEL_RECEIPT_FIELD')
  })
})
