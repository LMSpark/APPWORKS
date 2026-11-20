#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertClassModelGuideExecutableSchemas } from './lib/class-model-bundle-assert.mjs'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const bundleRoot = resolve(repoRoot, 'generated/dts-class-model')

assertClassModelGuideExecutableSchemas(bundleRoot)
console.log(`ClassModel guide jsonSchema-only gate passed: ${bundleRoot}`)
