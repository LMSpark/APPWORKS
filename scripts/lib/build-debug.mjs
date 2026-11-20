import inspector from 'node:inspector'

/**
 * 编译管线在线调试辅助。
 *
 * - `buildDebugBreak(step)`：Cursor/VS Code 通过 launch.json 启动（`--inspect`）时在关键步骤停住。
 * - `buildDebugTrace(step)`：设置 `SPARK_BUILD_TRACE=1` 可只看步骤日志、不断点。
 *
 * 入口见 `.vscode/launch.json`。
 */

function isInspectorAttached() {
  return inspector.url() !== undefined
}

function shouldTrace() {
  return process.env.SPARK_BUILD_TRACE === '1'
    || process.env.SPARK_BUILD_DEBUG === '1'
    || isInspectorAttached()
}

/**
 * @param {string} step
 * @param {Record<string, unknown>} [detail]
 */
export function buildDebugTrace(step, detail) {
  if (!shouldTrace()) return
  const suffix = detail === undefined ? '' : ` ${JSON.stringify(detail)}`
  console.log(`[build-trace] ${step}${suffix}`)
}

/**
 * @param {string} step
 * @param {Record<string, unknown>} [detail]
 */
export function buildDebugBreak(step, detail) {
  buildDebugTrace(step, detail)
  if (isInspectorAttached()) {
    // eslint-disable-next-line no-debugger
    debugger
  }
}
