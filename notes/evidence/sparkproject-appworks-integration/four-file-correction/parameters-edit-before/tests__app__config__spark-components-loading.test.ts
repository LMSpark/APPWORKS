import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'

import { ASYNC_PATH_PREFIXES } from '../../../packages/vite-plugin-spark-catalog/src/scan-config'
import { sparkComponentsPlugin } from '../../../tools/vite-plugin-spark-components'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('SPARK component loading strategy', () => {
  it.each([
    { label: 'configured view prefix', asyncPathPrefixes: [...ASYNC_PATH_PREFIXES] },
    { label: 'normalized view prefix', asyncPathPrefixes: ['./src\\views\\'] },
  ])('loads view pages on demand with $label', async ({ asyncPathPrefixes }) => {
    const root = await mkdtemp(join(tmpdir(), 'spark-components-loading-'))
    temporaryRoots.push(root)
    const fixtures: Array<readonly [string, string]> = [
      ['src/views/SmallPage.vue', '<template><main>small</main></template>'],
      ['src/views/nested/NestedPage.vue', '<template><main>nested</main></template>'],
      ['src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue', '<template><main>graph</main></template>'],
      ['src/views/PageRenderer.vue', '<template><main>core</main></template>'],
      ['src/views-other/Neighbor.vue', '<template><main>neighbor</main></template>'],
      ['src/components/DefaultWidget.vue', '<template><main>default</main></template>'],
      ['src/components/ChartDemo.vue', '<template><main>async by name</main></template>'],
      ['src/components/LargeWidget.vue', `<template>${'x'.repeat(60 * 1024)}</template>`],
      ['src/views/Excluded.test.vue', '<template><main>excluded</main></template>'],
    ]

    for (const [file, content] of fixtures) {
      const absolutePath = join(root, file)
      await mkdir(join(absolutePath, '..'), { recursive: true })
      await writeFile(absolutePath, content)
    }

    const options = {
      patterns: ['./src/**/*.vue'],
      syncComponents: ['PageRenderer'],
      asyncComponents: ['*Demo'],
      asyncPathPrefixes,
      sizeThreshold: 50,
      exclude: ['**/*.test.vue'],
    }
    const server = await createServer({
      configFile: false,
      root,
      logLevel: 'silent',
      server: { middlewareMode: true, watch: null },
      plugins: [sparkComponentsPlugin(options)],
    })

    try {
      const resolved = await server.pluginContainer.resolveId('virtual:spark-components')
      if (resolved === null) throw new Error('SPARK component virtual module was not resolved')
      const moduleCode = await server.pluginContainer.load(resolved.id)
      if (typeof moduleCode !== 'string') throw new Error('SPARK component virtual module did not load')

      expect(moduleCode).toContain("const smallPage = () => import('./src/views/SmallPage.vue')")
      expect(moduleCode).toContain("const nestedPage = () => import('./src/views/nested/NestedPage.vue')")
      expect(moduleCode).toContain("const dataSpaceDesignGraph = () => import('./src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue')")
      expect(moduleCode).toContain("import pageRenderer from './src/views/PageRenderer.vue'")
      expect(moduleCode).toContain("import neighbor from './src/views-other/Neighbor.vue'")
      expect(moduleCode).toContain("import defaultWidget from './src/components/DefaultWidget.vue'")
      expect(moduleCode).toContain("const chartDemo = () => import('./src/components/ChartDemo.vue')")
      expect(moduleCode).toContain("const largeWidget = () => import('./src/components/LargeWidget.vue')")
      expect(moduleCode).not.toContain('Excluded.test.vue')
      expect(moduleCode).toContain("registry.has('small-page')")
      expect(moduleCode).toContain("registry.register('small-page', defineAsyncComponent(smallPage))")
      expect(moduleCode).toContain("registry.has('data-space-design-graph')")
      expect(moduleCode).toContain("registry.register('data-space-design-graph', defineAsyncComponent(dataSpaceDesignGraph))")
      expect(moduleCode).toContain("registry.register('page-renderer', pageRenderer)")
    } finally {
      await server.close()
    }

    const defaultServer = await createServer({
      configFile: false,
      root,
      logLevel: 'silent',
      server: { middlewareMode: true, watch: null },
      plugins: [sparkComponentsPlugin({
        patterns: ['./src/**/*.vue'],
        syncComponents: ['PageRenderer'],
        asyncComponents: ['*Demo'],
        sizeThreshold: 50,
        exclude: ['**/*.test.vue'],
      })],
    })

    try {
      const resolved = await defaultServer.pluginContainer.resolveId('virtual:spark-components')
      if (resolved === null) throw new Error('SPARK component virtual module was not resolved')
      const moduleCode = await defaultServer.pluginContainer.load(resolved.id)
      if (typeof moduleCode !== 'string') throw new Error('SPARK component virtual module did not load')
      expect(moduleCode).toContain("import smallPage from './src/views/SmallPage.vue'")
    } finally {
      await defaultServer.close()
    }
  })
})
