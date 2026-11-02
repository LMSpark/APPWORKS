import {describe,expect,it} from 'vitest'
import {fixture} from './fixture'
import {getCodeInitializationPlan} from '@/lowcode/resources/structured-config/data-code/initialization-plan'
import {resolveCodeInitializationDate} from '@/lowcode/resources/structured-config/data-code/initialization-date'
describe('saved initialization plan and date contract',()=>{
  it.each([['yyyyMMdd','YYYYMMDD','date','YYYY-MM-DD','2026-11-02'],['yyyyMM','YYYYMM','month','YYYY-MM','2026-11'],['yy','YY','year','YYYY','2026']])(
    'separates display pattern %s from the confirmed service date input',async(pattern,format,dateType,valueFormat,value)=>{
      const {ds,service}=await fixture()
      service.http.records['Base_CodeNodeDesign']!.find(row=>row['rowid']==='TIME')!['CodeNodeDesignJson']=JSON.stringify({DateFormat:pattern})
      await ds.getView('Base_CodeNodeDesign')!.refresh()
      expect(await resolveCodeInitializationDate({dataSet:ds,runtime:service.runtime,plan:getCodeInitializationPlan(ds),now:new Date(2026,10,2)})).toMatchObject({format,dateType,valueFormat,value})
    })
  it('does not turn a missing stored segment number into a zero-based segment',async()=>{
    const {ds,service}=await fixture()
    service.http.records['Base_CodeNodeDesign']!.find(row=>row['rowid']==='TIME')!['NodeNo']=null
    await ds.getView('Base_CodeNodeDesign')!.refresh()
    expect(()=>getCodeInitializationPlan(ds)).toThrow('节点')
    expect(service.http.saves).toEqual([])
  })
  it('takes the saved sequence JSON and ordered loop columns and uses the executable date format instead of its title',async()=>{
    const {ds,service}=await fixture(),plan=getCodeInitializationPlan(ds)
    expect(plan).toMatchObject({codeId:'C1',nodeId:'SEQ',format:'001-999',increment:2,loopColumns:['1','2']})
    const date=await resolveCodeInitializationDate({dataSet:ds,runtime:service.runtime,plan,now:new Date(2026,10,2)})
    expect(date).toEqual({visible:true,format:'YYYYMM',valueFormat:'YYYY-MM',dateType:'month',value:'2026-11'})
    expect(service.http.saves).toEqual([])
  })
  it('rejects an unsaved main or modified segments before querying initialization data',async()=>{
    const {ds,service}=await fixture(),main=ds.getView('Base_CodeDesign')!,nodes=ds.getView('Base_CodeNodeDesign')!
    main.updateEditingValue('C1','Name','草稿');expect(()=>getCodeInitializationPlan(ds)).toThrow('保存')
    main.discardPendingChanges();nodes.updateEditingValue('N1','ParameterName','草稿');expect(()=>getCodeInitializationPlan(ds)).toThrow('保存')
    expect(service.http.saves).toEqual([])
  })
  it('does not open initialization for a design with no sequence',async()=>{
    const {ds,service}=await fixture(),nodes=ds.getView('Base_CodeNodeDesign')!
    service.http.records['Base_CodeNodeDesign']!.find(row=>row['rowid']==='SEQ')!['NodeType']=2
    await nodes.refresh()
    expect(()=>getCodeInitializationPlan(ds)).toThrow('顺序号')
  })
  it('follows parent-code dates through dedicated formal views without altering rule-picker queries',async()=>{
    const {ds,service}=await fixture(),nodes=ds.getView('Base_CodeNodeDesign')!
    service.http.records['Base_CodeNodeDesign']=service.http.records['Base_CodeNodeDesign']!.filter(row=>row['rowid']!=='TIME')
    service.http.records['Base_CodeNodeDesign']!.push({rowid:'PARENT',CodeDesignID:'C1',NodeNo:2,NodeType:5,CodeNodeDesignJson:'{"RefCodeId":"P1"}'},
      {rowid:'PTIME',CodeDesignID:'P1',NodeNo:1,NodeType:3,CodeNodeDesignJson:'{"DateFormat":"yyyy-MM-dd"}'})
    service.http.records['Base_CodeDesign']!.push({rowid:'P1',AppID:'A',Name:'父编码'})
    await nodes.refresh()
    const original=JSON.stringify(ds.getView('Base_CodeDesign','parents')!.filterExpression)
    expect(await resolveCodeInitializationDate({dataSet:ds,runtime:service.runtime,plan:getCodeInitializationPlan(ds),now:new Date(2026,10,2)})).toEqual({visible:true,format:'YYYY-MM-DD',valueFormat:'YYYY-MM-DD',dateType:'date',value:'2026-11-02'})
    expect(JSON.stringify(ds.getView('Base_CodeDesign','parents')!.filterExpression)).toBe(original)
    expect(nodes.rows.every(row=>row['CodeDesignID']==='C1')).toBe(true)
  })
  it('rejects a parent cycle and a parent outside the managed application without guessing a date',async()=>{
    const {ds,service}=await fixture(),nodes=ds.getView('Base_CodeNodeDesign')!
    service.http.records['Base_CodeNodeDesign']=service.http.records['Base_CodeNodeDesign']!.filter(row=>row['rowid']!=='TIME')
    const parent={rowid:'PARENT',CodeDesignID:'C1',NodeNo:2,NodeType:5,CodeNodeDesignJson:'{"RefCodeId":"C1"}'}
    service.http.records['Base_CodeNodeDesign']!.push(parent);await nodes.refresh()
    await expect(resolveCodeInitializationDate({dataSet:ds,runtime:service.runtime,plan:getCodeInitializationPlan(ds)})).rejects.toThrow('循环')
    parent.CodeNodeDesignJson='{"RefCodeId":"C2"}';await nodes.refresh()
    await expect(resolveCodeInitializationDate({dataSet:ds,runtime:service.runtime,plan:getCodeInitializationPlan(ds)})).rejects.toThrow('当前应用')
    expect(service.http.saves).toEqual([])
  })
})
