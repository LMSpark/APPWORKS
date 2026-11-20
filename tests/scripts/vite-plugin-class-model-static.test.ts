import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createClassModelStaticMiddleware } from '../../tools/vite-plugin-class-model-static'

type ClassModelStaticMiddleware = ReturnType<typeof createClassModelStaticMiddleware>

class ClassModelStaticResponseSink {
  public destroyed = false
  public readonly headers = new Map<string, number | string | readonly string[]>()
  public statusCode = 200
  public writableEnded = false
  private readonly chunks: Buffer[] = []
  private readonly resolveEnd: () => void

  public constructor(resolveEnd: () => void) {
    this.resolveEnd = resolveEnd
  }

  public setHeader(name: string, value: number | string | readonly string[]): void {
    this.headers.set(name, value)
  }

  public end(chunk?: string | Uint8Array): void {
    if (chunk !== undefined) {
      this.chunks.push(Buffer.from(chunk))
    }
    this.writableEnded = true
    this.resolveEnd()
  }

  public text(): string {
    return Buffer.concat(this.chunks).toString('utf8')
  }
}

describe('vite-plugin-class-model-static', () => {
  it('serves ClassModel files through a structurally writable response', async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), 'spark-class-model-static-'))
    try {
      await writeFile(join(sourceDir, 'manifest.json'), '{"ok":true}\n', 'utf8')

      const middleware = createClassModelStaticMiddleware(sourceDir, '/dts-class-model')
      const response = await serveStatic(middleware, '/dts-class-model/manifest.json')

      expect(response.writableEnded).toBe(true)
      expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
      expect(response.text()).toBe('{"ok":true}\n')
    } finally {
      await rm(sourceDir, { recursive: true, force: true })
    }
  })
})

function serveStatic(middleware: ClassModelStaticMiddleware, url: string): Promise<ClassModelStaticResponseSink> {
  return new Promise((resolve, reject) => {
    const response = new ClassModelStaticResponseSink(() => resolve(response))
    middleware({ url }, response, (error) => {
      if (error === undefined) {
        reject(new Error('Expected static middleware to serve the ClassModel request.'))
        return
      }
      reject(error)
    })
  })
}
