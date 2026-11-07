import {expect,it} from 'vitest'
import {ScenarioViewConfig} from '../../src/scenario/scenario-view-config'
function command(){return{resourceType:'command',resourceId:'test-service-command',columns:[{name:'commandId',type:'string',isPrimaryKey:true},{name:'key',type:'string'}],views:{default:{commitMode:'staged',autoLoad:false,queryConfig:{pagination:'none'}}}}}
function config(table:unknown){return new ScenarioViewConfig('SPACE',JSON.stringify({scenarioId:'SPACE',tables:{Run:table}}))}
it('preserves an explicit command resource without inventing a backend model binding',()=>{
 const value=config(command());expect(value.toJSON()).toMatchObject({tables:{Run:command()}})
 expect(value.getLayoutNodeKey('Run')).toBe('SPACE+Run')
 expect(value.selectModelScope('Run').toJSON()).toEqual(value.toJSON())
 expect(value.getTableRemovalReferences('Run')).toEqual([])
 const removed=new ScenarioViewConfig('SPACE',JSON.stringify({scenarioId:'SPACE',tables:{}}))
 expect(removed.selectTableValidationScope(value)).toBeNull()
})
it.each([
 ['backend model',{...command(),modelBinding:{modelId:'FAKE',modelName:'Fake'}}],
 ['HTTP API',{...command(),api:{list:{url:'/should-not-run'}}}],
 ['CRUD overrides',{...command(),crudConfig:{}}],
 ['missing key',{...command(),columns:[{name:'key',type:'string'}]}],
 ['multiple keys',{...command(),columns:[...command().columns,{name:'another',type:'string',isPrimaryKey:true}]}],
 ['non-string command key',{...command(),columns:[{name:'commandId',type:'number',isPrimaryKey:true}]}],
 ['auto-load',{...command(),views:{default:{...command().views.default,autoLoad:true}}}],
 ['immediate commit',{...command(),views:{default:{...command().views.default,commitMode:'immediate'}}}],
 ['remote pagination',{...command(),views:{default:{...command().views.default,queryConfig:{pagination:'paged'}}}}],
 ['source query configuration',{...command(),views:{default:{...command().views.default,queryConfig:{pagination:'none',sourceInputMode:'direct'}}}}],
])('rejects command configuration with %s',(_label,table)=>{expect(()=>config(table)).toThrow()})
