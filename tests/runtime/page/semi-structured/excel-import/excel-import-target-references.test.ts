import {expect, it} from 'vitest'
import {validateExcelTargetReferences as validate} from '@/lowcode/resources/semi-structured/excel-import/target-references'
import {DataViewFilter, DataViewFilterCodec} from '@spark-appworks/spark-data'
const base = {node: {table: 'DB@old', parentField: 'parent_only'}, oldFields: ['keep', 'old'], children: [], rules: [],
  selection: {applicationId: 'APP', applicationName: '应用', table: 'DB@new', description: '', fields: [{name: 'keep', title: '', type: 0, index: ''}]}}
it('checks current foreign keys and direct child parent keys without treating the current parent key as local', () => {
  expect(() => validate(base)).not.toThrow()
  expect(() => validate({...base, node: {...base.node, foreignKeyField: 'old'}})).toThrow('foreignKeyField')
  expect(() => validate({...base, children: [{rowid: 'child', parentField: 'old'}]})).toThrow('child')
})
it('validates formal filter and sort fields but preserves constant text that matches an old field', () => {
  expect(() => validate({...base, node: {...base.node, filters: JSON.stringify(DataViewFilterCodec.encode(DataViewFilter.condition({field: 'keep', operator: 'eq', value: {Type: 'GetConstValue', Value: 'old'}})))}})).not.toThrow()
  expect(() => validate({...base, node: {...base.node, filters: JSON.stringify(DataViewFilterCodec.encode(DataViewFilter.condition({field: 'old', operator: 'eq', value: 0})))}})).toThrow('filters')
  expect(() => validate({...base, node: {...base.node, sorted: JSON.stringify([{Field: 'old', Type: 'ascending'}])}})).toThrow('sorted[0].Field')
})
it('only traverses actual expression arguments and honors field before const as the execution engine does', () => {
  const rule = {id: 'R', rule_type: 'COMPUTE', config_json: JSON.stringify({expression: {op: 'CONCAT', args: [{const: {field: 'old'}}, 'old']}})}
  expect(() => validate({...base, rules: [rule]})).not.toThrow()
  expect(() => validate({...base, rules: [{...rule, condition_json: JSON.stringify({field: 'old', const: true})}]})).toThrow('condition_json.field')
  expect(() => validate({...base, rules: [{...rule, config_json: JSON.stringify({expression: {op: 'CONCAT', args: [{field: 'old'}]}})}]})).toThrow('expression.args[0].field')
})
it('keeps literal lookup maps and replacement strings while rejecting declared removed fields', () => {
  expect(() => validate({...base, rules: [{id: 'R', rule_type: 'LOOKUP', source_field: 'keep', config_json: JSON.stringify({mapping: {old: 'old'}})},
    {id: 'R2', rule_type: 'REPLACE', config_json: JSON.stringify({search: 'old', replacement: 'old'})}]})).not.toThrow()
  expect(() => validate({...base, rules: [{id: 'R', rule_type: 'VALIDATE', config_json: JSON.stringify({requiredFields: ['old']})}]})).toThrow('requiredFields')
})
it('preserves inactive layout verbatim and refuses a live binding to the retired physical target', () => {
  expect(() => validate({...base, node: {...base.node, sheet_layout_json: '{"enabled":false,"unknown":{"field":"old"}}'}})).not.toThrow()
  for (const layout of [{version: 1, enabled: true, regions: [{role: 'LIST', table: 'DB@old'}]},
    {version: 2, enabled: true, regions: [{id: 'L', target: {table: 'DB@old'}}]},
    {version: 3, enabled: true, tables: [{id: 'T', table: 'DB@old'}], regions: []}]) expect(() => validate({...base, node: {...base.node, sheet_layout_json: JSON.stringify(layout)}})).toThrow('仍绑定旧物理表')
})
it('checks explicit v2/v3 target field and link scopes while preserving unrelated targets and lookup literals', () => {
  const v2 = {version: 2, enabled: true, regions: [{id: 'A', target: {table: 'DB@new'}, fields: [{name: 'keep', lookup: {textField: 'old'}}]},
    {id: 'B', target: {table: 'DB@other', link: {fromRegion: 'A', sourceField: 'keep', targetField: 'not_local'}}, fields: [{name: 'not_local'}]}]}
  expect(() => validate({...base, node: {...base.node, sheet_layout_json: JSON.stringify(v2)}})).not.toThrow()
  const broken = structuredClone(v2); broken.regions[1]!.target.link!.sourceField = 'old'
  expect(() => validate({...base, node: {...base.node, sheet_layout_json: JSON.stringify(broken)}})).toThrow('sourceField')
  const v3 = {version: 3, enabled: true, tables: [{id: 'T', table: 'DB@new'}], regions: [{id: 'R', tableId: 'T', fields: [{name: 'keep'}]}]}
  expect(() => validate({...base, node: {...base.node, sheet_layout_json: JSON.stringify(v3)}})).not.toThrow()
  v3.regions[0]!.fields[0]!.name = 'old'
  expect(() => validate({...base, node: {...base.node, sheet_layout_json: JSON.stringify(v3)}})).toThrow('fields[0].name')
})
it('rejects string layout versions instead of bypassing the table and field scope', () => {
  expect(() => validate({...base, node: {...base.node, sheet_layout_json: JSON.stringify({version: '3', enabled: true, tables: [{id: 'T', table: 'DB@old'}], regions: [{id: 'R', tableId: 'T', fields: [{name: 'old'}]}]})}})).toThrow()
})
it('checks only the lookup value function against the current row', () => {
  const filter = DataViewFilterCodec.encode(DataViewFilter.condition({field: 'external_field', operator: 'eq', value: {Type: 'GetTableField', Field: 'old'}}))
  const layout = {version: 1, enabled: true, regions: [{id: 'R', role: 'FORM', table: 'DB@new', fields: [{name: 'keep', lookup: {refTable: 'DB@other', valueField: 'external_value', textField: 'external_text', filter}}]}]}
  expect(() => validate({...base, node: {...base.node, sheet_layout_json: JSON.stringify(layout)}})).toThrow('lookup.filter')
})

it('does not treat a non-consumed expression extension as a dependency of TRIM',()=>{
 expect(()=>validate({...base,rules:[{id:'R',rule_type:'TRIM',source_field:'keep',target_field:'keep',config_json:'{"expression":{"field":"old"}}'}]})).not.toThrow()
})

it('treats the same blank condition as absent during save and source replacement',()=>{
 expect(()=>validate({...base,rules:[{id:'R',rule_type:'TRIM',source_field:'keep',target_field:'keep',condition_json:'  ',config_json:'{}'}]})).not.toThrow()
})
