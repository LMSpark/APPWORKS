import {expect,it} from 'vitest'
import {DataSpaceQueryContext} from '../../query/data-space-query-context'
import {DataSpaceQueryTable} from '../../protocol/data-space-query-table'
function fixture(countReported=false){
 const identity={scenarioId:'SPACE',metaName:'RemotePage'},table=new DataSpaceQueryTable(identity)
 let scope='scope'
 const snapshot=table.applyResult({Result:{primaryKeyField:null,data:{Items:[{name:'visible',secret:'hidden',masked:'private',lingma_sys_params:{r:[],e:[],h:['secret'],m:['masked']}}],...(countReported?{Count:1}:{})}}})
 const context=new DataSpaceQueryContext({identity,snapshot,scope,readScope:()=>scope})
 return{context,expire:()=>{scope='expired'}}
}
it('derives independent immutable pagination metadata from the original private result',()=>{
 const {context}=fixture(),first=context.withNextPageAvailable(true),second=context.withNextPageAvailable(false)
 expect(context.nextPageAvailable).toBeUndefined();expect(first.nextPageAvailable).toBe(true);expect(second.nextPageAvailable).toBe(false)
 expect(first).not.toBe(context);expect(first.resultPrimaryKey).toBe('');expect(first.countReported).toBe(false)
 const row=first.rows[0]!
 expect(first.readFieldAccess(row,'name')).toBe('visible');expect(first.readFieldAccess(row,'secret')).toBe('invisible');expect(first.readFieldAccess(row,'masked')).toBe('masked')
 expect(first.deleteActionState(first.rowKey(row))).toBe('hidden')
 expect(()=>first.prepareSaveChanges({changed:[{name:'write'}]})).toThrow('SPARK_MODEL_KEYLESS_READONLY')
})
it.each(['invalidate','scope'] as const)('rejects a derived result after original %s invalidation',mode=>{
 const f=fixture(),derived=f.context.withNextPageAvailable(true)
 if(mode==='invalidate')f.context.invalidate();else f.expire()
 expect(()=>derived.nextPageAvailable).toThrow('SPARK_QUERY_CONTEXT_STALE')
 expect(()=>derived.rows).toThrow('SPARK_QUERY_CONTEXT_STALE')
})
it('refuses total-count results rather than changing their pagination semantics',()=>{
 expect(()=>fixture(true).context.withNextPageAvailable(true)).toThrow('SPARK_NEXT_PAGE_RESULT')
})
it.each([null,0,'yes',{}])('refuses malformed next-page metadata %j',value=>{
 const {context}=fixture()
 expect(()=>Reflect.apply(context.withNextPageAvailable,context,[value])).toThrow('SPARK_NEXT_PAGE_RESULT')
})
