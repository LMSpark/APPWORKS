import {describe, expect, it, vi} from 'vitest'
import {DataSet} from '../../dataset'
import {RequestState, type TableMetadata} from '../../types'

const candidate:TableMetadata={tableName:'Choices',resourceType:'database-table',resourceId:'DB',
  modelBinding:{modelId:'CHOICE_MODEL',modelName:'OfficialChoices'},
  columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'name',type:'string'}],
  views:{default:{autoLoad:false},sourceCandidates:{autoLoad:false,valueField:'id',labelField:'name',pageSize:10,selectionDelimiter:''}}}

describe('DataSet lazy table definition attachment',()=>{
  it('retains existing view identity and pending edits while attaching original model metadata and named views',()=>{
    const ds=DataSet.fromJson({scenarioId:'S',tables:{Params:{resourceType:'static-data',
      columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'value',type:'string'}],
      views:{default:{commitMode:'staged',rows:[{id:'P',value:'original'}]}}}}})
    try {
      const params=ds.getView('Params')!;params.updateEditingValue('P','value','draft')
      const loaded=vi.fn();ds.on('loadSuccess',loaded)
      const table=ds.addTableFromJson(candidate),view=table.getView('sourceCandidates')!
      expect(ds.getView('Params')).toBe(params)
      expect(params.getEditingRow('P')?.['value']).toBe('draft')
      expect(params.hasEditingChanges()).toBe(true)
      expect(table.dataSet).toBe(ds);expect(view.dataSet).toBe(ds)
      expect(table.modelBinding).toEqual(candidate.modelBinding)
      expect(table.resourceType).toBe('database-table');expect(table.resourceId).toBe('DB')
      expect(view.autoLoad).toBe(false);expect(view.rows).toEqual([])
      expect(view.valueField).toBe('id');expect(view.labelField).toBe('name');expect(view.pageSize).toBe(10)
      view.events.emit('requestStateChanged',RequestState.Loaded)
      expect(loaded).toHaveBeenCalledExactlyOnceWith({tableName:'Choices',viewId:'sourceCandidates'})
      ds.removeTable('Choices');expect(view.destroyed).toBe(true)
      expect(params.destroyed).toBe(false);expect(params.getEditingRow('P')?.['value']).toBe('draft')
    }finally{ds.destroy()}
  })
  it('rejects a duplicate without replacing or releasing the original table',()=>{
    const ds=DataSet.fromJson({scenarioId:'S',tables:{}})
    try {
      const original=ds.addTableFromJson(candidate)
      expect(()=>ds.addTableFromJson({...candidate,resourceId:'OTHER'})).toThrow(/already exists/)
      expect(ds.getTable('Choices')).toBe(original)
      expect(original.dataSet).toBe(ds);expect(original.getView('sourceCandidates')!.destroyed).toBe(false)
    }finally{ds.destroy()}
  })
  it('rejects attachment after its DataSet owner is disposed',()=>{
    const ds=DataSet.fromJson({scenarioId:'S',tables:{}});ds.destroy()
    expect(()=>ds.addTableFromJson(candidate)).toThrow(/destroyed/)
    expect(ds.getTable('Choices')).toBeUndefined()
  })
})
