import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { buildDtsClassModelBundle } from '../class-model/bundle/build-dts-class-model-bundle'
import { DtsClassModelBundleLoader } from '../class-model/bundle/dts-class-model-bundle-loader'
import { createRuntimeApiMetadataFromSurface } from '../class-model/dts-surface-to-runtime-api'
import { readDtsFileProjectionDocument } from '../class-model/bundle/read-dts-class-model-bundle-json'

describe('dts-surface-to-runtime-api', () => {
  it('maps guide bundle shard paramsSchema into script runtime API metadata', async () => {
    const tempRoot = resolve(tmpdir(), `spark-dts-surface-runtime-api-${String(process.pid)}-${String(Date.now())}`)
    const sourcePath = 'class-model-emit/packages/spark-ai/src/tests/script-contract.d.ts'
    const absolutePath = resolve(tempRoot, sourcePath)
    const outputDir = resolve(tempRoot, 'generated/dts-class-model')
    try {
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, [
        '/** Script contract root. */',
        'export class ScriptContractRoot {',
        '  /** Opens a child by id. */',
        '  openChild(childId: string): ScriptContractChild',
        '}',
        '/** Script contract child. */',
        'export class ScriptContractChild {',
        '  /** Reads the child label. */',
        '  readLabel(prefix: string): string',
        '}',
      ].join('\n'), 'utf8')

      const bundle = buildDtsClassModelBundle({
        repoRoot: tempRoot,
        rootFiles: [absolutePath],
        outputDir,
      })
      const manifestEntry = bundle.manifest.classIndex['ScriptContractRoot']
      expect(manifestEntry).toBeDefined()
      const shard = readDtsFileProjectionDocument(
        JSON.parse(readFileSync(resolve(outputDir, manifestEntry!.file), 'utf8')) as unknown,
      )
      const scriptContractRoot = shard.models['ScriptContractRoot']
      if (scriptContractRoot?.declarationKind !== 'class') throw new Error('expected class model')
      const openChild = scriptContractRoot.classDecl.members.methods.find(method => method.name === 'openChild')
      expect(openChild?.paramsSchema).toMatchObject({
        type: 'object',
        properties: {
          childId: { type: 'string' },
        },
      })

      const loader = new DtsClassModelBundleLoader({
        manifestUrl: pathToFileURL(bundle.manifestPath).href,
        fetchJson: async url => JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown,
      })
      const fromLoader = await loader.buildRuntimeApiMetadata('ScriptContractRoot')
      const fromSurface = createRuntimeApiMetadataFromSurface(loader.buildLoadedSurface(), 'ScriptContractRoot')

      const openChildAction = fromLoader.rootApi.actions.find(action => action.name === 'openChild')
      const surfaceOpenChildAction = fromSurface.rootApi.actions.find(action => action.name === 'openChild')
      expect(openChildAction?.paramsSchema).toEqual(openChild?.paramsSchema)
      expect(surfaceOpenChildAction?.paramsSchema).toEqual(openChild?.paramsSchema)
      expect(fromLoader.apiRegistry?.['ScriptContractChild']).toBeDefined()
      expect(loader.buildLoadedSurface().models['ScriptContractChild']).toBeDefined()
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
