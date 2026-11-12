import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '@/lowcode/data-space/lowcode-data-space-assembler'
import pagedata from '../../../../config/pages/application/project-blueprint/pagedata.json?raw'
import {ApiBackend} from '../../page/api-provider/api-provider.fixture'
import {buildFormalModels} from '../../page/structured-config/catalog/structured-config-catalog.fixture'

export const SCENARIO = '7AB874097A1E8711A42FD845939A6E05'
type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type Table = {modelBinding: {modelId: string; modelName: string}; views: Record<string, unknown>}

const HOST_MODELS: Record<string, readonly string[]> = {
  Base_Navigation_DataRelation: ['rowid', 'prowid', 'pName', 'title', 'dataSetId', 'DataName', 'dataType', 'selectTextParam', 'TextParamName',
    'selectValParam', 'ValParamName', 'selectPid', 'paramType', 'childrowid', 'location', 'DbName'],
  Base_DataSet: ['rowid', 'Name', 'description', 'sysid'],
  Base_DataModel: ['rowid', 'dataSetId', 'Name', 'MetaName', 'Type', 'DbName'],
  Base_DataModel_Field: ['rowid', 'dataModelId', 'Name', 'description', 'FieldType', 'AsName', 'type'],
}

function runtimeApi(http: ApiBackend): DataSpaceRuntimeApi {
  return new DataSpaceRuntimeApi({http, readScope: () => ({token: 'scope', headers: {'X-AppId': 'APP'}})})
}

/** 以蓝图 7AB 正式 pagedata 的宿主关系与三级候选表装配 DataSet，后端为内存 ApiBackend。 */
export function createHostRuntime() {
  const parsed = JSON.parse(pagedata) as {tables: Record<string, Table>}
  const tables = Object.fromEntries(Object.keys(HOST_MODELS).map(name => [name, parsed.tables[name]]))
  const models = buildFormalModels(HOST_MODELS).map(model => {
    const modelId = parsed.tables[model.name]!.modelBinding.modelId
    return {...model, id: modelId, fields: model.fields.map(field => ({...field, modelId}))}
  })
  const http = new ApiBackend()
  const config = new ScenarioViewConfig(SCENARIO, JSON.stringify({scenarioId: SCENARIO, tables}))
  const dataSet = new LowcodeDataSpaceAssembler(runtimeApi(http), http).assemble({config, space: {dataSpaceId: SCENARIO, name: 'Blueprint'}, models, relations: []}).dataSet
  return {http, dataSet}
}

export const DESKTOP_FIELDS = ['rowid', 'AppName', 'ShortCNName', 'AppOrdidx', 'AppUrl', 'MobileUrl', 'AppPopupMode', 'AppType', 'IsDesktopShow',
  'IsReqLogin', 'AppSmallIconUrl', 'BgColor', 'FontColor', 'IconStyle']

/** 桌面编辑器的按名解析依赖：readModel 只返回 available 中的模型，其余按服务端“未找到”拒绝。 */
export function createDesktopDeps(available: readonly string[] = ['Base_Desktop_System', 'Dict_Page_Popup', 'Dict_Desktop_AppType', 'DesktopStyle']) {
  const formal = buildFormalModels({
    Base_Desktop_System: DESKTOP_FIELDS,
    Dict_Page_Popup: ['rowid', 'val', 'txt'],
    Dict_Desktop_AppType: ['rowid', 'val', 'txt'],
    DesktopStyle: ['rowid', 'val', 'txt'],
  })
  const http = new ApiBackend()
  const design: Pick<DataSpaceDesignApi, 'readModel' | 'readSpaceDefinition'> = {
    readModel: async ({metaName}) => {
      const found = formal.find(model => model.metaName === metaName && available.includes(metaName))
      if (!found) throw new Error(`模型 ${metaName} 不存在`)
      return found satisfies FormalModel
    },
    readSpaceDefinition: async ({dataSpaceId}) => ({dataSpaceId, name: 'Blueprint', raw: {}}),
  }
  return {http, design, assembler: new LowcodeDataSpaceAssembler(runtimeApi(http), http)}
}
