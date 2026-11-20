export type PageContentState = Readonly<{
  baseline: string | null | undefined
  draft: string | undefined
  status: 'idle' | 'pending' | 'unknown'
  submitted: string | undefined
  revision: number
}>

export type PageContentRemoteRead = Readonly<{content: string | null; revision: number}>
export type PageContentWrite = Readonly<{kind: 'save' | 'create'; submitted: string; expectedContent: string | null;
  run: () => Promise<void>}>

/** Opaque text and one real host request owned by a page call, not its renderer. */
export class PageContentRuntime {
  #baseline: string | null | undefined
  #draft: string | undefined
  #status: PageContentState['status'] = 'idle'
  #submitted: string | undefined
  #revision = 0
  #disposed = false
  #remoteRead: PageContentRemoteRead | undefined
  readonly #listeners = new Set<() => void>()

  get baseline(): string | null | undefined { return this.#baseline }
  get draft(): string | undefined { return this.#draft }
  get status(): PageContentState['status'] { return this.#status }
  get revision(): number { return this.#revision }
  get isDirty(): boolean { return this.#status !== 'idle' || this.#draft !== undefined && this.#draft !== this.#baseline }
  snapshot(): PageContentState { return Object.freeze({baseline: this.#baseline, draft: this.#draft,
    status: this.#status, submitted: this.#submitted, revision: this.#revision}) }

  subscribe(listener: () => void): () => void {
    if (this.#disposed) throw new Error('PAGE_CONTENT_DISPOSED')
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #change(): void { this.#revision++;this.#remoteRead=undefined;for(const listener of this.#listeners)listener() }
  #assertAlive(): void { if(this.#disposed)throw new Error('PAGE_CONTENT_DISPOSED') }

  acceptRead(text: string | null, expectedRevision = this.#revision): boolean {
    this.#assertAlive()
    if (expectedRevision !== this.#revision || this.#status !== 'idle' || this.isDirty) return false
    this.#baseline = text
    this.#draft = undefined
    this.#change()
    return true
  }

  setDraft(text: string): void {
    this.#assertAlive()
    if (this.#baseline === undefined) throw new Error('PAGE_CONTENT_UNLOADED: 内容尚未读取')
    if (this.#status !== 'idle') throw new Error('PAGE_CONTENT_BUSY: 内容请求尚未确认')
    this.#draft = text
    this.#change()
  }

  discardDraft(): void {
    this.#assertAlive()
    if (this.#status !== 'idle') throw new Error('PAGE_CONTENT_BUSY: 内容请求尚未确认')
    if (this.#draft === undefined) return
    this.#draft = undefined
    this.#change()
  }

  async startWrite(command: PageContentWrite): Promise<void> {
    const {kind, submitted, expectedContent, run} = command
    this.#assertAlive()
    if (this.#status !== 'idle') throw new Error('PAGE_CONTENT_BUSY: 内容请求尚未确认')
    if (this.#baseline === undefined || this.#baseline !== expectedContent
      || kind === 'save' && expectedContent === null || kind === 'create' && expectedContent !== null) {
      throw new Error('PAGE_CONTENT_PREIMAGE: 布局原文基线不匹配')
    }
    if (this.#draft !== undefined && this.#draft !== submitted) throw new Error('PAGE_CONTENT_DRAFT: 草稿已变化')
    if (this.#draft === undefined) this.#draft = submitted
    this.#submitted = submitted
    this.#status = 'pending'
    this.#change()
    try {
      await run()
      if (this.#disposed) return
      this.#baseline = submitted
      if (this.#draft === submitted) this.#draft = undefined
      this.#status = 'idle'
      this.#submitted = undefined
      this.#change()
    } catch (error) {
      if (!this.#disposed) { this.#status = 'unknown'; this.#change() }
      throw error
    }
  }

  offerRemote(content: string | null, expectedRevision: number): PageContentRemoteRead {
    this.#assertAlive()
    if (expectedRevision !== this.#revision || this.#status === 'pending') throw new Error('PAGE_CONTENT_STALE: 内容状态已变化')
    const read = Object.freeze({content, revision: expectedRevision})
    this.#remoteRead = read
    return read
  }

  adoptRemote(read: PageContentRemoteRead, expectedRevision: number): void {
    this.#assertAlive()
    if (expectedRevision !== this.#revision || this.#remoteRead !== read || this.#status === 'pending') {
      throw new Error('PAGE_CONTENT_STALE: 远端读取或本地草稿已变化')
    }
    this.#baseline = read.content
    this.#draft = undefined
    this.#status = 'idle'
    this.#submitted = undefined
    this.#change()
  }

  dispose(): void { this.#disposed=true;this.#remoteRead=undefined;this.#listeners.clear() }
}
