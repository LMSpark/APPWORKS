// Offline-only request-guard check. It imports formal request builders but sends no requests.
import assert from 'node:assert/strict'
import {businessScopeFailure, classifyApplicationSelectionRequest} from './b1-reference-probe-guard.mjs'
import {createServer} from 'vite'

const APP = 'D99A1DCE9894698799101EFD70F8FC76'
const TENANT = 'NewApp'
const root = process.cwd()
const server = await createServer({root, mode: 'development', configFile: false,
  server: {middlewareMode: true, hmr: false}, appType: 'custom'})
try {
  const formal = await server.ssrLoadModule('/packages/spark-lowcode-api/src/platform/lowcode-application.ts')
  const shared = {formKey: formal.LOWCODE_APPLICATION_CATALOG_FORM_KEY, tenantId: '', appId: '',
    expectedFormKey: formal.LOWCODE_APPLICATION_CATALOG_FORM_KEY,
    applicationCatalogQuery: formal.applicationCatalogQuery(),
    navigationRootQuery: formal.navigationRootQuery(APP)}
  assert.deepEqual(classifyApplicationSelectionRequest({...shared, body: formal.applicationCatalogQuery()}),
    {kind: 'application-catalog', errorCode: ''})
  assert.deepEqual(classifyApplicationSelectionRequest({...shared, body: formal.navigationRootQuery(APP)}),
    {kind: 'navigation-root', errorCode: ''})
  assert.equal(businessScopeFailure('', APP, TENANT, APP), 'TENANT_SCOPE_MISMATCH')
  assert.equal(businessScopeFailure(TENANT, '', TENANT, APP), 'APPLICATION_SCOPE_MISMATCH')
  assert.equal(businessScopeFailure(TENANT, APP, TENANT, APP), '')
  console.log(JSON.stringify({status: 'passed', mode: 'offline-only', checks: 5,
    accepted: ['application-catalog', 'navigation-root'], rejected: ['formal-read-missing-tenant', 'formal-read-missing-app'],
    networkRequests: 0}, null, 2))
} finally {
  await server.close()
}
