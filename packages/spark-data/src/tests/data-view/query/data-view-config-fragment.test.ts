import {describe,expect,it} from 'vitest'
import {DataSet} from '../../../dataset'
describe('DataView configuration fragments',()=>{
  it('retains pagination when an unrelated fragment or only one paging property is applied',()=>{
    const ds=DataSet.fromJson({tables:{Rows:{columns:[{name:'id',type:'string',isPrimaryKey:true}],views:{default:{page:4,pageSize:10,autoLoad:false}}}}})
    try{
      const view=ds.getView('Rows')!
      view.configure({selectionDelimiter:''})
      expect(view.page).toBe(4);expect(view.pageSize).toBe(10)
      view.configure({page:2});expect(view.page).toBe(2);expect(view.pageSize).toBe(10)
      view.configure({pageSize:30});expect(view.page).toBe(2);expect(view.pageSize).toBe(30)
    }finally{ds.destroy()}
  })
})
