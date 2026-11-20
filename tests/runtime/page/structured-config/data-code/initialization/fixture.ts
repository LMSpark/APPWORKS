import {afterEach} from 'vitest'
import {PageRuntime,ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import {codeService,designText,DESIGN} from '../data-code.fixture'


const pages:PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
export async function fixture(){
  const service=codeService()
  service.http.records['Dict_CodeNodeType']!.push({rowid:'T3',val:'3',txt:'时间字符串'},{rowid:'T4',val:'4',txt:'顺序号串'},{rowid:'T5',val:'5',txt:'父编码串'})
  service.http.records['Base_CodeNodeDesign']!.push({rowid:'SEQ',CodeDesignID:'C1',NodeNo:3,NodeType:4,ParameterName:'序号',CodeNodeDesignJson:'{"Format":"001-999","StartNo":"1","EndNo":"2","Incre":"2"}'},
    {rowid:'TIME',CodeDesignID:'C1',NodeNo:2,NodeType:3,ParameterName:'过期显示标题',CodeNodeDesignJson:'{"DateFormat":"yyyyMM"}'})
  const models=await service.readModelBatch({metaNames:Object.keys(JSON.parse(designText).tables)})
  const ds=new LowcodeDataSpaceAssembler(service.runtime,service.http).assemble({config:new ScenarioViewConfig(DESIGN,designText),space:{dataSpaceId:DESIGN,name:'Code'},models,relations:[]}).dataSet
  const page=new PageRuntime({pageId:'init-plan',scenarioIds:[DESIGN],scenarioInputs:{[DESIGN]:{applicationId:'A',codeDesignId:'C1'}},loadScenario:async()=>ds})
  pages.push(page);await page.load();await ds.getView('Base_CodeDesign')!.refresh();await ds.getView('Base_CodeNodeDesign')!.refresh();await ds.getView('Dict_CodeNodeType')!.refresh()
  return {ds,service,page}
}
