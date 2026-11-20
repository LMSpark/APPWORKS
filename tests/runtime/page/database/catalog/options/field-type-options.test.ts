import {expect,it} from 'vitest'
import {DataSet,bindDataSetReadonlyCommandQuery,ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {databaseCatalogFieldTypeOptions} from '@/lowcode/resources/database/catalog/table/field-type-options'

it.each(['rows','page'] as const)('preserves the %s query boundary while mapping the service JSON type label',async mode=>{
 const dataSet=DataSet.fromJson({scenarioId:'TYPE-OPTIONS',tables:{}})
 const resource={resourceType:'service-query',resourceId:'type-options'}
 const view=ensureDataSetResourceView({dataSet,tableName:'Options',resource,columns:[{name:'id',primary:true},{name:'val'},{name:'label'}]})
 const rows=[{id:'json',val:'JSON类型',label:'JSON'},{id:'text',val:'字符串',label:'Text'}]
 bindDataSetReadonlyCommandQuery(view,databaseCatalogFieldTypeOptions({resource,guard:()=>{},...(mode==='rows'?{loadRows:async()=>rows}:{loadPage:async()=>({rows,total:45})})}))
 try{
  await view.refresh()
  expect(view.rows.map(row=>row['val'])).toEqual(['json类型','字符串'])
  expect(view.total).toBe(mode==='rows'?2:45)
  expect(view.rows[0]?.['label']).toBe('JSON')
  expect(view.fieldAccess(view.rows[0]!,'val').write).toBe('denied')
  expect(rows[0]?.val).toBe('JSON类型')
 }finally{dataSet.destroy()}
})
