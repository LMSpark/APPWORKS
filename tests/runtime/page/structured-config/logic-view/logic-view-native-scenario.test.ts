import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {resolveBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
const scenarioId='EB720370EF06A5A656838F87E0716D6B'
it('declares consumers by source identity across spaces without filtering away drifted model names',()=>{
 const config=new ScenarioViewConfig('8D1AB14DD8277F3E7017CD38F77B09FD',readFileSync('config/pages/data-platform/data-space-design/pagedata.json','utf8')).toJSON()
 const tables=config['tables'] as Record<string,{views:Record<string,Record<string,unknown>>}>
 expect(tables['Base_DataModel']?.views['logicViewConsumers']).toMatchObject({autoLoad:false,queryContext:{viewId:''},queryConfig:{allPages:true,fields:['rowid','dataSetId','Type','DbId','MetaName']},filterExpression:{logic:'and',filters:[{field:'Type',operator:'eq',value:'视图'},{field:'DbId',operator:'eq',value:{Type:'GetInputParam',ParamName:'viewId'}}]}})
})
it('declares an independent staged output publication view scoped to the original viewId',()=>{
 const config=new ScenarioViewConfig('8D1AB14DD8277F3E7017CD38F77B09FD',readFileSync('config/pages/data-platform/data-space-design/pagedata.json','utf8')).toJSON()
 const tables=config['tables'] as Record<string,{modelBinding:{modelName:string};views:Record<string,Record<string,unknown>>}>
 const fields=tables['Base_TblField']!
 expect(fields.modelBinding.modelName).toBe('Base_TblField')
 expect(fields.views['logicViewOutputFields']).toMatchObject({autoLoad:false,autoCurrentFirst:false,autoSelectFirst:false,commitMode:'staged',lockCurrentWhilePending:true,queryContext:{viewId:''},queryConfig:{allPages:true,fields:['rowid','tblid','enname','cnname','description','DataType','IsPKey']},filterExpression:{field:'tblid',operator:'eq',value:{Type:'GetInputParam',ParamName:'viewId'}}})
 expect(fields.views['default']).toBeDefined();expect(fields.views['sourceDetails']).toBeDefined()
})
it('declares a formal catalog and an independent exact editor target without eager queries',()=>{
 const resource=resolveBuiltinScenarioResource(scenarioId)
 expect(resource?.path).toBe('config/pages/structured-config/logic-view-catalog/pagedata.json')
 if(!resource)throw Error('Missing logical view scenario')
 const config=new ScenarioViewConfig(scenarioId,readFileSync(resource.path,'utf8')).toJSON()
 const tables=config['tables'] as Record<string,{modelBinding:{modelName:string;modelId:string};views:Record<string,Record<string,unknown>>}>
 expect(tables['Base_DataViewList']?.modelBinding.modelName).toBe('Base_DataViewList')
 expect(tables['Base_DataViewList']?.views['default']?.['filterExpression']).toBeUndefined()
 expect(tables['Base_DataViewList']?.views['default']?.['autoLoad']).toBe(false)
 expect(tables['Base_DataViewList']?.views['editorTarget']).toMatchObject({autoLoad:false,autoCurrentFirst:false,commitMode:'staged',queryContext:{viewId:''},filterExpression:{field:'rowid',operator:'eq',value:{Type:'GetInputParam',ParamName:'viewId'}}})
 expect(Object.keys(tables).sort()).toEqual(['Base_AppSystemList','Base_DataViewList','Base_UserInfo'])
})
it('keeps view parameters separate from default and interface source details',()=>{
 const config=new ScenarioViewConfig('8D1AB14DD8277F3E7017CD38F77B09FD',readFileSync('config/pages/data-platform/data-space-design/pagedata.json','utf8')).toJSON()
 const tables=config['tables'] as Record<string,{views:Record<string,Record<string,unknown>>}>
 const views=tables['_Base_ParamList']!.views
 expect(views['logicViewParameters']).toMatchObject({autoLoad:false,autoCurrentFirst:false,commitMode:'staged',lockCurrentWhilePending:true,valueField:'parname',labelField:'parname',queryConfig:{allPages:true,fields:['parid','pid','parname','pardesc','testvalue']},filterExpression:{field:'pid',operator:'eq',value:{Type:'GetInputParam',ParamName:'viewId'}}})
 expect(views['sourceDetails']).toBeDefined();expect(views['default']).toBeDefined()
 for(const name of ['View_TblList','_Base_DictType','Base_DataServiceInterface','Base_JsonData']){
  expect(tables[name]!.views['sourceCandidates']).toMatchObject({autoLoad:false,selectionDelimiter:'',autoSelectFirst:false,autoCurrentFirst:false})
 }
})
