import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, mergeConfig } from 'vitest/config'
import original from '../../../../../../vitest.config'

const evidence = 'notes/evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/legacy-table-positions'
const replacements = new Map([
  ['src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts', 'lowcode-data-space-view-design.ts.before.txt'],
  ['src/lowcode/data-space/lowcode-data-space-design.ts', 'lowcode-data-space-design.ts.before.txt'],
].map(([source, before]) => [resolve(source).replaceAll('\\', '/'), readFileSync(resolve(evidence, before), 'utf8')]))

export default mergeConfig(original, defineConfig({
  plugins: [{
    name: 'layout-before-source-probe',
    enforce: 'pre',
    transform(_source, id) {
      const replacement = replacements.get(id.split('?')[0].replaceAll('\\', '/'))
      if (replacement === undefined) return
      console.info(`[layout-baseline] ${id}`)
      return { code: replacement, map: null }
    },
  }],
}))
