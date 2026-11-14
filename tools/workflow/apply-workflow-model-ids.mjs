#!/usr/bin/env node
/**
 * 将 read-workflow-model-ids.mjs 的 JSON 输出写入 workflow pagedata（stdin 或文件路径）。
 */
import {readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function readInput() {
  const arg = process.argv[2]
  const text = arg ? readFileSync(arg, 'utf8') : readFileSync(0, 'utf8')
  return JSON.parse(text)
}

function patchPagedata(path, patchModels) {
  const file = join(root, path)
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  for (const [name, modelId] of Object.entries(patchModels)) {
    if (!modelId) continue
    const table = doc.tables?.[name]
    if (!table?.modelBinding) {
      console.error(`跳过 ${path}：缺少表 ${name}`)
      continue
    }
    table.modelBinding = {...table.modelBinding, modelId: String(modelId)}
  }
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  console.log(`已更新 ${path}`)
}

function main() {
  const payload = readInput()
  const listModels = payload.scenarios?.flowModelList?.models ?? {}
  const designModels = payload.scenarios?.flowDesign?.models ?? {}
  const flowModelId = listModels.WFM_FLOW_MODLE ?? designModels.WFM_FLOW_MODLE
  patchPagedata('config/pages/workflow/flow-model-list/pagedata.json', {WFM_FLOW_MODLE: flowModelId})
  patchPagedata('config/pages/workflow/flow-design/pagedata.json', designModels)
}

main()