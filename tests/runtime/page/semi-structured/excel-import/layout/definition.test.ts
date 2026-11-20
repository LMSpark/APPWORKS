import {describe,it,expect} from 'vitest'
import {isJsonObject} from '@spark-appworks/spark-json-document'
import {createSingleExportLayout,readSingleExportLayout,validateSingleExportLayout} from '@/lowcode/resources/semi-structured/excel-import/layout/definition'
function complete(){
 const value=createSingleExportLayout('db@head','db@detail')
 const parts=readSingleExportLayout(JSON.stringify(value))!
 parts.form['bounds']={sheet:0,from:'B2',to:'B2'};parts.form['fields']=[{name:'name',locate:{mode:'cell',cell:'B2'},extra:{zero:0,flag:false}}]
 parts.list['bounds']={sheet:0,from:'A4',to:'A6'};parts.list['scan']={headerRow:4,dataStartOffset:1};parts.list['fields']=[{name:'detailName',title:'ITEM',locate:{mode:'listColumn',column:'A'}}]
 if(!isJsonObject(parts.list['link']))throw Error('link missing');Object.assign(parts.list['link'],{parentField:'id',foreignKeyField:'parentId'})
 parts.block['bounds']={sheet:0,from:'B6',to:'B7'};parts.block['fields']=[{name:'code',locate:{mode:'afterList',rowOffset:1,column:'B'}}]
 return parts.document
}
describe('single-group formal export layout',()=>{
 it('creates stable structural identities only after an explicit command, without sample fields or coordinates',()=>{
  const value=createSingleExportLayout('db@head','db@detail'),part=readSingleExportLayout(JSON.stringify(value))!
  expect(value['version']).toBe(3);expect(value['enabled']).toBe(false)
  for(const region of [part.form,part.list,part.block])expect(region['fields']).toEqual([])
  expect(()=>validateSingleExportLayout(JSON.stringify(value))).toThrow()
  expect(()=>createSingleExportLayout('db@head','db@head')).toThrow()
 })
 it('validates the persisted one/two-detail coordinate contract without normalizing extensions',()=>{
  const value=complete(),text=JSON.stringify(value)
  expect(validateSingleExportLayout(text)).toBeUndefined();expect(JSON.stringify(value)).toBe(text)
  expect(readSingleExportLayout(text)!.form['fields']).toEqual([{name:'name',locate:{mode:'cell',cell:'B2'},extra:{zero:0,flag:false}}])
 })
 it('does not interpret old versions, unknown shapes or reordered execution as an editable single-group layout',()=>{
  for(const value of [{version:1,enabled:true},{...complete(),version:2},{...complete(),sheetOrder:[]}])expect(()=>readSingleExportLayout(JSON.stringify(value))).toThrow()
  expect(readSingleExportLayout('')).toBeUndefined();expect(validateSingleExportLayout('')).toBeUndefined()
 })
 it('rejects illegal positions, duplicate detail columns and missing link keys before saving',()=>{
  const value=complete(),part=readSingleExportLayout(JSON.stringify(value))!
  part.form['fields']=[{name:'name',locate:{mode:'cell',cell:'XFE1'}}];expect(()=>validateSingleExportLayout(JSON.stringify(part.document))).toThrow()
  const other=readSingleExportLayout(JSON.stringify(complete()))!,list=other.list
  list['fields']=[{name:'a',locate:{mode:'listColumn',column:'A'}},{name:'b',locate:{mode:'listColumn',column:'A'}}];expect(()=>validateSingleExportLayout(JSON.stringify(other.document))).toThrow()
  const missing=readSingleExportLayout(JSON.stringify(complete()))!;missing.list['link']={};expect(()=>validateSingleExportLayout(JSON.stringify(missing.document))).toThrow()
 })
})
