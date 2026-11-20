import {expect,it,vi} from 'vitest'
import {checkOperationStationFits,readComposedOperationRouteCandidate} from '@/services/smart-bid/operation/operation-station-fit'

const nodes=[
 {id:'r',parentId:null,index:0,type:'route',class:['root'],value:'路线',data:{}},
 {id:'p',parentId:'r',index:0,type:'phase',class:['review'],value:'复核',data:{}},
 {id:'a',parentId:'p',index:0,type:'task',class:[],value:'核对',data:{stationRef:'S1'}},
 {id:'b',parentId:'p',index:1,type:'task',class:['write'],value:'填写',data:{stationRef:'S2'}},
]
it('supplies nearest phase classes and explicit task classes to the station rules',()=>{
 const match=vi.fn<(ref:string,classes:readonly string[])=>boolean>(()=>true)
 checkOperationStationFits({nodes},match)
 expect(match.mock.calls).toEqual([['S1',['review']],['S2',['write']]])
})
it('rejects the candidate if a selected station does not fit its effective classes',()=>{
 expect(()=>checkOperationStationFits({nodes},ref=>ref!=='S2')).toThrow('OPERATION_ROUTE_STATION_FIT: b')
})
it('checks the locked directory before invoking the supplied fit rules',()=>{
 const match=vi.fn<(ref:string,classes:readonly string[])=>boolean>(()=>true)
 const catalog={stationRefs:['S1'],routeRefs:[]}
 expect(()=>readComposedOperationRouteCandidate({nodes},catalog,match)).toThrow('OPERATION_ROUTE_STATION_OUTSIDE_CATALOG')
 expect(match).not.toHaveBeenCalled()
 const fullCatalog={...catalog,stationRefs:['S1','S2']}
 expect(readComposedOperationRouteCandidate({nodes},fullCatalog,match)).toEqual({nodes})
 expect(match.mock.calls).toEqual([['S1',['review']],['S2',['write']]])
})
it('rejects a missing directory at the JSON craft boundary before applying fit rules',()=>{
 const match=vi.fn(()=>true)
 expect(()=>Reflect.apply(readComposedOperationRouteCandidate,undefined,[{nodes},undefined,match]))
  .toThrow('OPERATION_ROUTE_CATALOG_REQUIRED')
 expect(match).not.toHaveBeenCalled()
})
