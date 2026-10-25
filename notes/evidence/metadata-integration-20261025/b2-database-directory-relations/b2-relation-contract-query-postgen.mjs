import {readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createServer} from 'vite'

const env = await readFile('.env.local', 'utf8')
const setting = env.split(/\r?\n/).find(line => line.startsWith('LOWCODE_GATEWAY_URL='))
if (!setting) throw new Error('GATEWAY_SETTING_MISSING')
process.env.LOWCODE_GATEWAY_URL = setting.slice('LOWCODE_GATEWAY_URL='.length).replace(/^['"]|['"]$/g, '')
const server = await createServer({root: process.cwd(), mode: 'development', server: {middlewareMode: true}, appType: 'custom'})
try {
  const {createDtsBundleClassModelKnowledgeProvider} = await server.ssrLoadModule('/packages/spark-ai/src/class-model/index.ts')
  const result = {}
  for (const kind of ['DataColumn', 'DataView', 'DataSet', 'RFormProps', 'RTableProps', 'RSelectProps', 'RButtonProps', 'PageRuntime', 'SparkCrudDataContainerProps', 'SparkTableModelProps', 'SparkOptionFieldProps', 'RFilterExpressionProps', 'FilterExpressionEditorProps', 'DatabaseCatalogRelationSession']) {
    const provider = createDtsBundleClassModelKnowledgeProvider({dtsClassModelManifestUrl: pathToFileURL(resolve('generated/dts-class-model/manifest.json')).href,
      rootClassName: kind, fetchJson: async url => JSON.parse(await readFile(new URL(url), 'utf8'))})
    await provider.init()
    result[kind] = {catalog: await provider.query({kind, includeMembers: false}),
      members: await provider.query({kind, includeMembers: true}), guide: await provider.modelGuide({kind})}
  }
  for (const [kind, members] of Object.entries({DataColumn: ['allowAIAdd'], DataView: ['columns', 'createEditingCheckpoint', 'getPkKey'],
    SparkTableModelProps: ['dataViewKey'], RTableProps: ['toolbar'], SparkOptionFieldProps: ['optionDataViewKey'], RButtonProps: ['dataViewKey'], RFilterExpressionProps: ['format', 'field', 'onEditingChange'], FilterExpressionEditorProps: ['columns', 'functionContext'], DatabaseCatalogRelationSession: ['queryIdentity', 'checkpoint']})) {
    for (const member of members) if (!JSON.stringify(result[kind].members).includes(member)) throw new Error(`${kind}.${member} missing`)
  }
  await writeFile('node_modules/.cache/metadata-integration-20261025/b2-relation-contract-query-postgen.json', JSON.stringify(result, null, 2), {flag: 'wx'})
  console.log(JSON.stringify({status: 'passed', roots: Object.keys(result), queriesPerRoot: ['catalog', 'members', 'guide'], serviceRequests: 0}))
} finally { await server.close() }
