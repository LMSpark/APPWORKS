#!/usr/bin/env node

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertClassModelSemanticGapsZero } from './lib/class-model-bundle-assert.mjs'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const bundleRoot = resolve(repoRoot, 'generated/dts-class-model')

assertClassModelSemanticGapsZero(bundleRoot)
console.log('ClassModel semantic gate verification passed (module/model/constructor gaps=0).')
