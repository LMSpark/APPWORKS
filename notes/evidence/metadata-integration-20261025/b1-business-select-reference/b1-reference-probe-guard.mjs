import {isDeepStrictEqual} from 'node:util'

/** Classify only the two exact, pre-application-selection GetData requests. */
export function classifyApplicationSelectionRequest(input) {
  if (input.formKey !== input.expectedFormKey) {
    return {kind: '', errorCode: 'APPLICATION_SELECTION_QUERY_MISMATCH'}
  }
  if (input.tenantId || input.appId) {
    return {kind: '', errorCode: 'APPLICATION_SELECTION_SCOPE_UNEXPECTED'}
  }
  if (isDeepStrictEqual(input.body, input.applicationCatalogQuery)) {
    return {kind: 'application-catalog', errorCode: ''}
  }
  if (isDeepStrictEqual(input.body, input.navigationRootQuery)) {
    return {kind: 'navigation-root', errorCode: ''}
  }
  return {kind: '', errorCode: 'APPLICATION_SELECTION_QUERY_MISMATCH'}
}

/** Require the authenticated application and enterprise headers for business reads. */
export function businessScopeFailure(tenantId, appId, expectedTenant, expectedApp) {
  if (tenantId !== expectedTenant) return 'TENANT_SCOPE_MISMATCH'
  if (appId !== expectedApp) return 'APPLICATION_SCOPE_MISMATCH'
  return ''
}
