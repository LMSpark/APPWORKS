import { mergeConfig } from 'vitest/config'
import base from '../../../../../../vitest.config'

export default mergeConfig(base, { test: {
  include: ['notes/evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/computed-runtime/review-probe.test.ts'],
} })
