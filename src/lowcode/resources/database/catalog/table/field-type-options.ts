/**
 * @module app:lowcode/resources/database/catalog/table/field-type-options
 * 职责：字段类型字典到建表服务类型名的只读投影；不改原字典、字段数据或写权限。
 * 依据：实服拒绝JSON类型；FieldBizTypeEnum.JSON的服务标签是json类型。其余类型原样保留。
 */
import type {BindReadonlyCommandQueryOptions,DataRow} from '@spark-appworks/spark-data'

/** 保留原查询身份/分页及标签，只将已证实的JSON别名映射为服务类型；映射冲突明确失败。 */
export function databaseCatalogFieldTypeOptions(binding: BindReadonlyCommandQueryOptions): BindReadonlyCommandQueryOptions {
  const mapRows = (rows:readonly DataRow[]) => {
    const values = new Set<string>()
    return rows.map(row => {
      const value = row['val'] === 'JSON类型' ? 'json类型' : row['val']
      if (values.has(String(value))) throw Error('字段类型字典映射后代码重复')
      values.add(String(value))
      return {...row, val: value}
    })
  }
  if(binding.loadPage!==undefined){
    const loadPage=binding.loadPage
    return {...binding,loadPage:async(view,params)=>{
      const page=await loadPage(view,params)
      return {...page,rows:mapRows(page.rows)}
    }}
  }
  const loadRows=binding.loadRows
  return {...binding,loadRows:async(view,params)=>mapRows(await loadRows(view,params))}
}
