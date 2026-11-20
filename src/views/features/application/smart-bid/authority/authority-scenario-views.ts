/**
 * @module app:views/features/application/smart-bid/authority/authority-scenario-views
 * 职责：按已登记模型组装企业委托、资料原版和用途决定的命名视图。
 */
import {authorityGrantRegistrationView} from './authority-grant-registration-reader'
import {resourceUseRegistrationView} from './resource-use-registration-reader'
import {resourceVersionHistoryView,resourceVersionReadView} from './resource-version-reader'

/** 主键和字段定义由正式模型登记提供。 */
export function authorityScenarioViews(primaryKeys:Readonly<Record<'AuthorityGrant'|'ResourceVersion'|'ResourceUseDecision',string>>){
 return {
  AuthorityGrant:{originalRegistration:authorityGrantRegistrationView(primaryKeys.AuthorityGrant)},
  ResourceVersion:{
   originalVersion:resourceVersionReadView(primaryKeys.ResourceVersion),
   versionHistory:resourceVersionHistoryView(primaryKeys.ResourceVersion),
  },
  ResourceUseDecision:{originalRegistration:resourceUseRegistrationView(primaryKeys.ResourceUseDecision)},
 }
}
