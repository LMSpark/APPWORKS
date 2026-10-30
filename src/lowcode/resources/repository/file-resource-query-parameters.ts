import {ScenarioDefinitionResource, DataSpaceReferenceLayoutResource, ProjectToolResource} from '@spark-appworks/spark-project-model'
import {LOWCODE_FILE_RESOURCE_REGISTRY} from './agent-workflow-file-resource'

/** Resolve parameter fields only for resource families that own that contract. */
export function fileResourceQueryParameters(resourceId: string, viewId: string) {
  if (resourceId === DataSpaceReferenceLayoutResource.resourceId) return DataSpaceReferenceLayoutResource.queryParameters()
  if (Object.values(ProjectToolResource.resources).some(id => id === resourceId)) return ProjectToolResource.queryParameters(resourceId)
  const registered = LOWCODE_FILE_RESOURCE_REGISTRY.find(resource => resource.resourceId === resourceId)
  if (registered) {
    if (!Object.hasOwn(registered.views, viewId)) throw new Error(`FILE_RESOURCE_VIEW_IDENTITY: ${resourceId}@${viewId} 未注册`)
    const parameters = registered.queryParameters[viewId]
    if (!parameters) throw new Error(`FILE_RESOURCE_QUERY_PARAMETERS: ${resourceId}@${viewId} 未声明参数目录`)
    return parameters
  }
  return ScenarioDefinitionResource.queryParameters(resourceId)
}
