import {defineConfig} from 'vitest/config'
import base from 'D:/SPARK_AppWorks/vitest.config.ts'

export default defineConfig({...base, test: {...base.test, include: [
  'notes/evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/computed-persistence/review-probes/*.test.ts',
]}})
