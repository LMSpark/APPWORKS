import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { FieldCheckboxGroup, FieldMultiSelect, FieldSelect, FieldTreeSelect } from '@spark-appworks/spark-component'
import { SparkData } from '@spark-appworks/spark-data'
import type { DataRow, QueryParams } from '@spark-appworks/spark-data'
import { mountFieldInContext } from '../../../support/helpers/mount-field-in-context'

const Select = defineComponent({
  props: ['modelValue', 'disabled'], emits: ['update:modelValue'],
  setup(props, {slots}) { return () => h('div', {class: 'select',
    'data-value': JSON.stringify(props.modelValue), 'data-disabled': String(props.disabled)}, slots['default']?.()) },
})
const Option = defineComponent({
  props: ['value', 'label'],
  setup(props) { return () => h('span', {class: 'option', 'data-value': String(props.value)}, String(props.label)) },
})
const FormItem = defineComponent({
  props: ['error'], setup(props, {slots}) {
    return () => h('div', {class: 'form-item', 'data-error': props.error}, slots['default']?.())
  },
})
const TreeSelect = defineComponent({
  props: ['modelValue', 'data', 'disabled'], emits: ['update:modelValue'],
  setup(props) { return () => h('div', {class: 'tree-select', 'data-options': JSON.stringify(props.data),
    'data-value': JSON.stringify(props.modelValue)}) },
})

type QueryIdentity = {scenarioId: string; metaName: string}
type ResultAccess = {hidden?: string; readonly?: boolean}

function queryResult(table: string, rows: DataRow[], access?: ResultAccess) {
  return {rows, total: rows.length,
    assertIdentity(identity: QueryIdentity) {
      if (identity.scenarioId !== 'FORM' || identity.metaName !== table) throw new Error('wrong query identity')
    },
    rowKey: (row: DataRow) => row['id'],
    fieldAccess: (_key: unknown, field: string) => ({read: field === access?.hidden ? 'invisible' as const : 'visible' as const,
      write: access?.readonly ? 'denied' as const : 'allowed' as const, required: false,
      component: access?.readonly ? 'readonly' as const : 'editable' as const,
      writeMode: access?.readonly ? 'readonly' as const : 'editable' as const}),
    readFieldAccess: (_row: DataRow, field: string) => field === access?.hidden ? 'invisible' as const : 'visible' as const,
    addActionState: () => 'hidden' as const, editActionState: () => 'hidden' as const,
    deleteActionState: () => 'hidden' as const, createChildActionState: () => 'hidden' as const,
    viewActionState: () => 'hidden' as const,
  }
}

async function fixture(access?: ResultAccess) {
  const ds = SparkData.fromJson({scenarioId: 'FORM', dataSetName: 'FORM', tables: {
    Orders: {modelBinding: {modelId: 'O', modelName: 'Orders'}, columns: [
      {name: 'id', type: 'number', isPrimaryKey: true}, {name: 'country', type: 'string'}, {name: 'city', type: 'string'}],
    views: {default: {autoCurrentFirst: true}}},
    Cities: {modelBinding: {modelId: 'C', modelName: 'Cities'}, columns: [
      {name: 'id', type: 'number', isPrimaryKey: true}, {name: 'code', type: 'string'}, {name: 'name', type: 'string'},
      {name: 'parentId', type: 'number'}],
    views: {default: {valueField: 'code', labelField: 'name', selectionDelimiter: '|'}}},
  }, viewCascades: [{kind: 'field', cascadeId: 'city', tableName: 'Orders', viewId: 'default', targetField: 'city',
    valueFormat: 'selection-string', parents: [{tableName: 'Orders', viewId: 'default', field: 'country', parameter: 'country'}],
    optionsView: {tableName: 'Cities', viewId: 'default'}, valuePolicy: {mode: 'retain-valid', clearValue: ''}}]})
  const orders = ds.getView('Orders', 'default')!
  const choices = ds.getView('Cities', 'default')!
  orders.bindQueryExecutor({executeQuery: async () => queryResult('Orders', [{id: 1, country: 'A', city: '01|0'}], access)})
  const query = vi.fn(async (_view: unknown, params?: QueryParams) => queryResult('Cities', params?.context?.['country'] === 'A'
    ? [{id: 10, code: '01', name: '城市一'}, {id: 20, code: '0', name: '城市零'}]
    : params?.context?.['country'] === 'B' ? [{id: 20, code: '0', name: '城市零'}]
      : [{id: 99, code: 'GLOBAL', name: '共享视图污染项'}]))
  choices.bindQueryExecutor({executeQuery: query})
  await choices.loadFromServer()
  await orders.loadFromServer()
  query.mockClear()
  return {ds, orders, choices, query}
}

function mountMulti(f: Awaited<ReturnType<typeof fixture>>) {
  return mountFieldInContext({component: FieldMultiSelect, type: 'r-multi-select', model: f.orders.currentRow!,
    fieldName: 'city', dataSource: f.orders, pageDataSet: f.ds,
    componentProps: {optionDataViewKey: 'Cities@default'},
    global: {stubs: {'el-select': Select, 'el-option': Option, 'el-form-item': FormItem}},
  })
}

function mountDirect(f:Awaited<ReturnType<typeof fixture>>,onChange?:()=>Promise<void>){
  f.ds.removeCascade({cascadeId:'city'})
  return mountFieldInContext({component:FieldSelect,type:'r-select',model:f.orders.currentRow!,fieldName:'city',dataSource:f.orders,pageDataSet:f.ds,
    componentProps:{optionDataViewKey:'FORM@Cities@default',options:[{value:'FALLBACK',label:'不应回退'}],...(onChange?{onChange}:{})},
    global:{stubs:{'el-select':Select,'el-option':Option,'el-form-item':FormItem}}})
}

describe('direct option DataView failure and recovery',()=>{
  it('shows direct query failure, removes stale choices and rejects synthetic input without clearing the original value',async()=>{
    const f=await fixture(),wrapper=mountDirect(f)
    try{
      await flushPromises();expect(wrapper.findAll('.option').map(item=>item.attributes('data-value'))).toEqual(['GLOBAL'])
      f.query.mockRejectedValueOnce(new Error('直接选项查询被拒绝'));await f.choices.refresh();await flushPromises()
      expect(wrapper.get('.form-item').attributes('data-error')).toContain('直接选项查询被拒绝')
      expect(wrapper.findAll('.option')).toHaveLength(0);expect(wrapper.get('.select').attributes('data-disabled')).toBe('true')
      wrapper.getComponent(Select).vm.$emit('update:modelValue','GLOBAL');await flushPromises();expect(f.orders.hasEditingChanges()).toBe(false);expect(f.orders.getEditingRow(1)?.['city']).toBe('01|0')
      f.query.mockResolvedValueOnce(queryResult('Cities',[{id:77,code:'NEW',name:'恢复选项'}]));await f.choices.refresh();await flushPromises()
      expect(wrapper.get('.form-item').attributes('data-error')).toBeUndefined();expect(wrapper.get('.select').attributes('data-disabled')).toBe('false');expect(wrapper.findAll('.option').map(item=>item.attributes('data-value'))).toEqual(['NEW']);expect(f.orders.hasEditingChanges()).toBe(false)
    }finally{wrapper.unmount();f.ds.destroy()}
  })

  it('keeps old choices unavailable during a direct refresh and resumes only on its new result',async()=>{
    const f=await fixture(),wrapper=mountDirect(f);let complete:((value:ReturnType<typeof queryResult>)=>void)|undefined,request:ReturnType<typeof f.choices.refresh>|undefined
    try{
      await flushPromises();f.query.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve}));request=f.choices.refresh();await flushPromises()
      expect(wrapper.get('.select').attributes('data-disabled')).toBe('true');expect(wrapper.findAll('.option')).toHaveLength(0)
      complete?.(queryResult('Cities',[{id:77,code:'NEW',name:'新结果'}]));await request;await flushPromises();expect(wrapper.get('.select').attributes('data-disabled')).toBe('false');expect(wrapper.findAll('.option').map(item=>item.attributes('data-value'))).toEqual(['NEW'])
    }finally{complete?.(queryResult('Cities',[]));await request?.catch(()=>undefined);wrapper.unmount();f.ds.destroy()}
  })

  it('drops an asynchronous choice captured before the option query was replaced',async()=>{
    const f=await fixture();let complete:(()=>void)|undefined,entered=false;const gate=new Promise<void>(resolve=>{complete=resolve})
    const wrapper=mountDirect(f,async()=>{entered=true;await gate})
    try{
      await flushPromises();wrapper.getComponent(Select).vm.$emit('update:modelValue','GLOBAL');await flushPromises();expect(entered).toBe(true)
      f.query.mockResolvedValueOnce(queryResult('Cities',[{id:77,code:'NEW',name:'新结果'}]));await f.choices.refresh();await flushPromises();complete?.();await flushPromises();expect(f.orders.hasEditingChanges()).toBe(false);expect(f.orders.getEditingRow(1)?.['city']).toBe('01|0')
    }finally{complete?.();wrapper.unmount();f.ds.destroy()}
  })

  it('matches text dictionary codes to a numeric column and writes the numeric value',async()=>{
    const ds=SparkData.fromJson({scenarioId:'FORM',dataSetName:'FORM',tables:{
      Nav:{modelBinding:{modelId:'N',modelName:'Nav'},columns:[{name:'id',type:'number',isPrimaryKey:true},{name:'openMode',type:'int'}],views:{default:{autoCurrentFirst:true}}},
      Dict:{modelBinding:{modelId:'D',modelName:'Dict'},columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'val',type:'string'},{name:'txt',type:'string'}],
        views:{default:{valueField:'val',labelField:'txt'}}}}})
    const nav=ds.getView('Nav','default')!,dict=ds.getView('Dict','default')!
    nav.bindQueryExecutor({executeQuery:async()=>queryResult('Nav',[{id:1,openMode:3}])})
    dict.bindQueryExecutor({executeQuery:async()=>queryResult('Dict',[{id:'a',val:'3',txt:'当前窗体'},{id:'b',val:'2',txt:'新窗体'}])})
    await dict.loadFromServer();await nav.loadFromServer()
    const wrapper=mountFieldInContext({component:FieldSelect,type:'r-select',model:nav.currentRow!,fieldName:'openMode',dataSource:nav,pageDataSet:ds,
      componentProps:{optionDataViewKey:'FORM@Dict@default'},global:{stubs:{'el-select':Select,'el-option':Option,'el-form-item':FormItem}}})
    try{
      await flushPromises();expect(wrapper.get('.select').attributes('data-value')).toBe('"3"')
      wrapper.getComponent(Select).vm.$emit('update:modelValue','2');await flushPromises()
      expect(nav.getEditingRow(1)?.['openMode']).toBe(2)
    }finally{wrapper.unmount();ds.destroy()}
  })
})

describe('field components consume native value cascades', () => {
  it('rejects option-value trimming for a configured data cascade', async () => {
    const f = await fixture()
    try {
      expect(() => mountFieldInContext({
        component: FieldSelect, type: 'r-select', model: f.orders.currentRow!, fieldName: 'city',
        dataSource: f.orders, pageDataSet: f.ds,
        componentProps: {optionDataViewKey: 'FORM@Cities@default', optionValueField: 'code', optionValueTrim: true},
        global: {stubs: {'el-select': Select, 'el-option': Option, 'el-form-item': FormItem}},
      })).toThrow('FIELD_OPTION_VALUE: 修剪选项值需要直接绑定平面视图和明确的字段值')
    } finally {f.ds.destroy()}
  })

  it('rejects option-value trimming for DataView record selection', async () => {
    const f = await fixture()
    try {
      f.ds.removeCascade({cascadeId: 'city'})
      expect(() => mountFieldInContext({
        component: FieldSelect, type: 'r-select', model: f.choices.currentRow ?? {}, fieldName: '',
        dataSource: f.choices, pageDataSet: f.ds,
        componentProps: {dataMember: 'value', optionDataViewKey: 'FORM@Cities@default', optionValueField: 'code', optionValueTrim: true},
        global: {stubs: {'el-select': Select, 'el-option': Option, 'el-form-item': FormItem}},
      })).toThrow('FIELD_OPTION_VALUE: 修剪选项值需要直接绑定平面视图和明确的字段值')
    } finally {f.ds.destroy()}
  })

  it('isolates identical binding addresses in separate runtime spaces', async () => {
    const a = await fixture()
    const b = await fixture()
    b.orders.updateEditingValue(1, 'country', 'B')
    const first = mountMulti(a)
    const second = mountMulti(b)
    try {
      await flushPromises()
      expect(first.findAll('.option').map(option => option.attributes('data-value'))).toEqual(['01', '0'])
      expect(second.findAll('.option').map(option => option.attributes('data-value'))).toEqual(['0'])
      first.findComponent(Select).vm.$emit('update:modelValue', ['01'])
      await flushPromises()
      expect(a.orders.getEditingPatch(1)).toEqual({city: '01'})
      expect(b.orders.getEditingRow(1)?.['city']).toBe('0')
    } finally { first.unmount(); second.unmount(); a.ds.destroy(); b.ds.destroy() }
  })

  it('releases removed definitions and resumes the same binding after recreation', async () => {
    const f = await fixture()
    const wrapper = mountMulti(f)
    try {
      await flushPromises()
      const definition = f.ds.getCascade({cascadeId: 'city'})!
      f.ds.removeCascade({cascadeId: 'city'})
      await flushPromises()
      expect(wrapper.findAll('.option').map(option => option.attributes('data-value'))).toEqual(['GLOBAL'])
      expect(f.query).toHaveBeenCalledOnce()
      f.ds.addCascade(definition)
      await flushPromises()
      expect(wrapper.findAll('.option').map(option => option.attributes('data-value'))).toEqual(['01', '0'])
      expect(f.query).toHaveBeenCalledTimes(2)
      expect(f.orders.hasEditingChanges()).toBe(false)
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('requeries after options configuration changes and uses the new format without rewriting source values', async () => {
    const f = await fixture()
    const wrapper = mountMulti(f)
    try {
      await flushPromises()
      f.choices.configure({valueField: 'id', labelField: 'code', selectionDelimiter: ';'})
      await flushPromises()
      expect(f.query).toHaveBeenCalledTimes(2)
      expect(wrapper.findAll('.option').map(option => option.attributes('data-value'))).toEqual(['10', '20'])
      expect(wrapper.findAll('.option').map(option => option.text())).toEqual(['01', '0'])
      expect(wrapper.find('.select').attributes('data-value')).toBe('["01|0"]')
      expect(f.orders.hasEditingChanges()).toBe(false)
      wrapper.findComponent(Select).vm.$emit('update:modelValue', ['10', '20'])
      await flushPromises()
      expect(f.orders.getEditingPatch(1)).toEqual({city: '10;20'})
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('does not expose options denied by the actual query result', async () => {
    const f = await fixture()
    f.query.mockResolvedValueOnce(queryResult('Cities', [{id: 10, code: 'secret', name: '不可读'}], {hidden: 'code'}))
    const wrapper = mountMulti(f)
    try {
      await flushPromises()
      expect(wrapper.findAll('.option')).toHaveLength(0)
      expect(wrapper.find('.select').attributes('data-disabled')).toBe('true')
      expect(wrapper.find('.form-item').attributes('data-error')).toContain('code')
      expect(f.orders.hasEditingChanges()).toBe(false)
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('keeps a readable but non-writable target disabled and rejects synthetic changes', async () => {
    const f = await fixture({readonly: true})
    const wrapper = mountMulti(f)
    try {
      await flushPromises()
      expect(wrapper.findAll('.option')).toHaveLength(2)
      expect(wrapper.find('.select').attributes('data-disabled')).toBe('true')
      wrapper.findComponent(Select).vm.$emit('update:modelValue', ['0'])
      await flushPromises()
      expect(f.orders.hasEditingChanges()).toBe(false)
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('preserves native arrays and ordinary strings containing a delimiter', async () => {
    const f = await fixture()
    f.ds.updateCascade({cascadeId: 'city'}, {valueFormat: 'native'})
    f.orders.updateEditingValue(1, 'city', ['01|0', 0])
    f.query.mockResolvedValueOnce(queryResult('Cities', [
      {id: 10, code: '01|0', name: '组合编码'}, {id: 20, code: 0, name: '零'},
    ]))
    const wrapper = mountMulti(f)
    try {
      await flushPromises()
      expect(wrapper.find('.select').attributes('data-value')).toBe('["01|0",0]')
      wrapper.findComponent(Select).vm.$emit('update:modelValue', [0, '01|0'])
      await flushPromises()
      expect(f.orders.getEditingPatch(1)).toEqual({city: [0, '01|0']})
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('does not use the pointer target options for a different supplied form row', async () => {
    const f = await fixture()
    const wrapper = mountFieldInContext({component: FieldMultiSelect, type: 'r-multi-select',
      model: {id: 2, country: 'B', city: 'OTHER'}, fieldName: 'city', dataSource: f.orders, pageDataSet: f.ds,
      global: {stubs: {'el-select': Select, 'el-option': Option, 'el-form-item': FormItem}},
    })
    try {
      await flushPromises()
      expect(wrapper.findAll('.option')).toHaveLength(0)
      expect(f.query).not.toHaveBeenCalled()
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('builds a tree from independent results and serializes numeric values at every depth', async () => {
    const f = await fixture()
    f.choices.setTreeConfig({idField: 'id', parentIdField: 'parentId', textField: 'name'})
    f.query.mockResolvedValueOnce(queryResult('Cities', [
      {id: 10, parentId: null, code: 0, name: '父项'}, {id: 20, parentId: 10, code: 1, name: '子项'},
    ]))
    f.orders.updateEditingValue(1, 'city', '0|1')
    const wrapper = mountFieldInContext({component: FieldTreeSelect, type: 'r-tree-select',
      model: f.orders.currentRow!, fieldName: 'city', dataSource: f.orders, pageDataSet: f.ds,
      componentProps: {multiple: true}, global: {stubs: {'el-tree-select': TreeSelect, 'el-form-item': FormItem}},
    })
    try {
      await flushPromises()
      expect(JSON.parse(wrapper.find('.tree-select').attributes('data-options')!)).toEqual([
        {value: '0', label: '父项', disabled: false, children: [{value: '1', label: '子项', disabled: false}]},
      ])
      expect(wrapper.find('.tree-select').attributes('data-value')).toBe('["0","1"]')
      wrapper.findComponent(TreeSelect).vm.$emit('update:modelValue', ['1'])
      await flushPromises()
      expect(f.orders.getEditingPatch(1)).toEqual({city: '1'})
      expect(f.choices.rows).toMatchObject([{id: 99, code: 'GLOBAL'}])
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('keeps the newest options when the initial request resolves late', async () => {
    const f = await fixture()
    let complete!: (value: ReturnType<typeof queryResult>) => void
    const pending = new Promise<ReturnType<typeof queryResult>>(resolve => { complete = resolve })
    f.query.mockImplementationOnce(() => pending)
    const wrapper = mountMulti(f)
    try {
      await flushPromises()
      expect(wrapper.find('.select').attributes('data-disabled')).toBe('true')
      f.orders.updateEditingValue(1, 'country', 'B')
      await flushPromises()
      expect(wrapper.findAll('.option').map(option => option.attributes('data-value'))).toEqual(['0'])
      complete(queryResult('Cities', [{id: 10, code: '01', name: '旧选项'}]))
      await flushPromises()
      expect(wrapper.findAll('.option').map(option => option.attributes('data-value'))).toEqual(['0'])
      expect(wrapper.find('.select').attributes('data-disabled')).toBe('false')
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('shows query errors and disables editing without shared options or destructive clearing', async () => {
    const f = await fixture()
    f.query.mockRejectedValueOnce(new Error('选项服务不可用'))
    const wrapper = mountMulti(f)
    try {
      await flushPromises()
      expect(wrapper.find('.form-item').attributes('data-error')).toContain('选项服务不可用')
      expect(wrapper.findAll('.option')).toHaveLength(0)
      expect(wrapper.find('.select').attributes('data-disabled')).toBe('true')
      expect(f.orders.hasEditingChanges()).toBe(false)
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('decodes and writes checkbox values through the same binding', async () => {
    const f = await fixture()
    const wrapper = mountFieldInContext({component: FieldCheckboxGroup, type: 'r-checkbox-group',
      model: f.orders.currentRow!, fieldName: 'city', dataSource: f.orders, pageDataSet: f.ds,
      global: {stubs: {'el-checkbox-group': Select, 'el-checkbox': Option, 'el-form-item': FormItem}},
    })
    try {
      await flushPromises()
      expect(wrapper.find('.select').attributes('data-value')).toBe('["01","0"]')
      wrapper.findComponent(Select).vm.$emit('update:modelValue', ['0'])
      await flushPromises()
      expect(f.orders.getEditingPatch(1)).toEqual({city: '0'})
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('rebinds a changed definition and releases its state subscription on unmount', async () => {
    const f = await fixture()
    const listener = f.ds.onFieldCascadeChange.bind(f.ds)
    const stop = vi.fn()
    vi.spyOn(f.ds, 'onFieldCascadeChange').mockImplementation(callback => {
      const unsubscribe = listener(callback)
      return () => { stop(); unsubscribe() }
    })
    const wrapper = mountMulti(f)
    try {
      await flushPromises()
      f.ds.updateCascade({cascadeId: 'city'}, {parents: [
        {tableName: 'Orders', viewId: 'default', field: 'country', parameter: 'region'},
      ]})
      await flushPromises()
      expect(f.query).toHaveBeenCalledTimes(2)
      expect(f.query.mock.calls[1]?.[1]?.context).toEqual({region: 'A'})
      expect(wrapper.findAll('.option').map(option => option.attributes('data-value'))).toEqual(['GLOBAL'])
      expect(f.orders.hasEditingChanges()).toBe(false)
    } finally { wrapper.unmount(); expect(stop).toHaveBeenCalledOnce(); f.ds.destroy() }
  })

  it('renders independent options and restores the persisted string without changing the shared view', async () => {
    const f = await fixture()
    const wrapper = mountMulti(f)
    try {
      await flushPromises()
      expect(f.query).toHaveBeenCalledOnce()
      expect(wrapper.findAll('.option').map(option => option.attributes('data-value'))).toEqual(['01', '0'])
      expect(wrapper.find('.select').attributes('data-value')).toBe('["01","0"]')
      expect(f.choices.rows).toMatchObject([{id: 99, code: 'GLOBAL'}])
      expect(f.orders.hasEditingChanges()).toBe(false)
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('writes a user selection in the original string format and updates after a parent value change', async () => {
    const f = await fixture()
    const wrapper = mountMulti(f)
    try {
      await flushPromises()
      wrapper.findComponent(Select).vm.$emit('update:modelValue', ['0', '01'])
      await flushPromises()
      expect(f.orders.getEditingPatch(1)).toEqual({city: '0|01'})
      f.orders.updateEditingValue(1, 'country', 'B')
      await flushPromises()
      expect(wrapper.findAll('.option').map(option => option.attributes('data-value'))).toEqual(['0'])
      expect(f.orders.getEditingRow(1)?.['city']).toBe('0')
      expect(wrapper.find('.select').attributes('data-value')).toBe('["0"]')
    } finally { wrapper.unmount(); f.ds.destroy() }
  })

  it('uses the configured options without requiring a second page-level option source', async () => {
    const f = await fixture()
    f.orders.updateEditingValue(1, 'city', '01')
    const wrapper = mountFieldInContext({component: FieldSelect, type: 'r-select', model: f.orders.currentRow!,
      fieldName: 'city', dataSource: f.orders, pageDataSet: f.ds,
      global: {stubs: {'el-select': Select, 'el-option': Option, 'el-form-item': FormItem}},
    })
    try {
      await flushPromises()
      expect(wrapper.findAll('.option')).toHaveLength(2)
      expect(wrapper.find('.select').attributes('data-value')).toBe('"01"')
    } finally { wrapper.unmount(); f.ds.destroy() }
  })
})
