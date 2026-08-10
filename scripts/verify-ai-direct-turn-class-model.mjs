#!/usr/bin/env node
/**
 * Optional non-SSE LLM probe for ClassModel tool calling.
 *
 * This script only runs when an explicit AI_DIRECT_TURN_URL is provided.
 * It verifies the direct-turn endpoint can make the LLM choose model_script
 * with a JavaScript async function body. It does not execute the script.
 */

const DEFAULT_TIMEOUT_MS = 120_000

async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.url === undefined) {
    console.log('[direct-turn] skipped: set AI_DIRECT_TURN_URL to run this optional probe.')
    return
  }

  const body = await postDirectTurn(options)
  const toolCall = findModelScriptToolCall(body)
  if (toolCall === undefined) {
    throw new Error(`Expected model_script tool call, received: ${JSON.stringify(body)}`)
  }
  const script = readModelScriptArgument(toolCall)
  assertJavaScriptFunctionBody(script)
  console.log(`[direct-turn] ok: model_script script chars=${script.length}`)
}

async function postDirectTurn(options) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    const response = await fetch(options.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(createProbeRequest()),
    })
    const body = await readJson(response)
    if (!response.ok) {
      throw new Error(`direct-turn failed: HTTP ${response.status} ${JSON.stringify(body)}`)
    }
    return body
  } finally {
    clearTimeout(timeout)
  }
}

function createProbeRequest() {
  return {
    systemPrompt: [
      'You are using a ClassModel runtime.',
      'The only execution tool is model_script.',
      'Call model_script exactly once.',
      'The script argument must be JavaScript async function body text.',
      'Do not write TypeScript, TSX, JSX, import, export, interface, type declarations, or a function wrapper.',
      'Use this as the ProjectModel runtime object.',
    ].join(' '),
    messages: [
      {
        role: 'user',
        content: 'Call model_script with JavaScript that awaits this.readProjectPlanningInput() and returns the result.',
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'model_script',
          description: 'Execute JavaScript async function body against the current ClassModel root instance.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              script: {
                type: 'string',
                description: 'JavaScript async function body. Do not include TypeScript syntax or import/export.',
              },
            },
            required: ['script'],
          },
        },
      },
    ],
    mode: 'function',
    scope: {
      businessRegistrationId: 'projectPlanning',
      businessInstanceId: 'direct-turn-class-model-probe',
    },
    includeRequestEcho: false,
  }
}

function findModelScriptToolCall(body) {
  const candidates = [
    ...(Array.isArray(body?.toolCalls) ? body.toolCalls : []),
    ...(Array.isArray(body?.tool_calls) ? body.tool_calls : []),
  ]
  return candidates.find(toolCall => readToolName(toolCall) === 'model_script')
}

function readToolName(toolCall) {
  if (!isRecord(toolCall)) return undefined
  const directName = readText(toolCall['name']) ?? readText(toolCall['functionName'])
  if (directName !== undefined) return directName
  const fn = isRecord(toolCall['function']) ? toolCall['function'] : undefined
  return readText(fn?.['name'])
}

function readModelScriptArgument(toolCall) {
  if (!isRecord(toolCall)) throw new Error('model_script tool call must be an object.')
  const args = readToolArguments(toolCall)
  const script = readText(args['script'])
  if (script === undefined) {
    throw new Error(`model_script arguments must contain a non-empty script string: ${JSON.stringify(toolCall)}`)
  }
  return script
}

function readToolArguments(toolCall) {
  const direct = parseArguments(toolCall['arguments']) ?? parseArguments(toolCall['args'])
  if (direct !== undefined) return direct
  const fn = isRecord(toolCall['function']) ? toolCall['function'] : undefined
  const nested = parseArguments(fn?.['arguments']) ?? parseArguments(fn?.['args'])
  return nested ?? {}
}

function parseArguments(value) {
  if (isRecord(value)) return value
  if (typeof value !== 'string') return undefined
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function assertJavaScriptFunctionBody(script) {
  const forbidden = [
    /\bimport\s/u,
    /\bexport\s/u,
    /\binterface\s/u,
    /\btype\s+\w+\s*=/u,
    /\basync\s+function\b/u,
    /\bfunction\s+\w*\s*\(/u,
    /:\s*(string|number|boolean|unknown|any|void)\b/u,
  ]
  for (const pattern of forbidden) {
    if (pattern.test(script)) {
      throw new Error(`model_script script contains non-runtime JavaScript syntax: ${pattern}`)
    }
  }
  if (!/\bthis\./u.test(script)) {
    throw new Error('model_script script must operate on the runtime root object via this.')
  }
}

function parseOptions(args) {
  const explicitUrl = readArg(args, '--url') ?? process.env.AI_DIRECT_TURN_URL
  const timeoutValue = readArg(args, '--timeout-ms') ?? process.env.AI_DIRECT_TURN_TIMEOUT_MS
  const timeoutMs = timeoutValue === undefined ? DEFAULT_TIMEOUT_MS : Number(timeoutValue)
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid timeout: ${timeoutValue}`)
  }
  return {
    url: explicitUrl,
    timeoutMs,
  }
}

function readArg(args, flag) {
  const index = args.indexOf(flag)
  if (index < 0) return undefined
  return readText(args[index + 1])
}

async function readJson(response) {
  const text = await response.text()
  if (text.trim().length === 0) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function readText(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
