import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createMemoryHistory, createRouter} from 'vue-router'
import {buildPageService} from '../../../../../packages/spark-component/src/page/services/buildPageService'

const {post} = vi.hoisted(() => ({post: vi.fn()}))
vi.mock('@spark-appworks/spark-utils', async importOriginal => ({
  ...await importOriginal<typeof import('@spark-appworks/spark-utils')>(),
  createRequest: () => ({post}),
}))

const router = () => createRouter({history: createMemoryHistory(), routes: []})
const file = (name: string) => new File([name], name, {type: 'text/plain'})

describe('default page upload service receipts', () => {
  beforeEach(() => {post.mockReset()})

  it('returns a confirmed server address and preserves file metadata', async () => {
    post.mockResolvedValue({data: {url: '/files/one.txt'}})
    const selected = file('one.txt')
    await expect(buildPageService(router()).uploadFiles({action: '/upload', files: [selected]})).resolves.toEqual([
      expect.objectContaining({file: selected, name: 'one.txt', url: '/files/one.txt'}),
    ])
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('propagates a transport rejection instead of returning the local filename as an uploaded file', async () => {
    post.mockRejectedValue(new Error('connection lost'))
    await expect(buildPageService(router()).uploadFiles({action: '/upload', files: [file('one.txt')]})).rejects.toThrow()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each([{Code: 500, Message: 'rejected'}, {}, {url: ''}, {url: '   '}])('rejects an unconfirmed default upload response %j', async response => {
    post.mockResolvedValue(response)
    await expect(buildPageService(router()).uploadFiles({action: '/upload', files: [file('one.txt')]})).rejects.toThrow()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('retains confirmed results when a later file is unconfirmed and stops subsequent transfers', async () => {
    const first = file('one.txt'), second = file('two.txt'), third = file('three.txt')
    post.mockResolvedValueOnce({url: '/files/one.txt'}).mockRejectedValueOnce(new Error('connection lost'))
    await expect(buildPageService(router()).uploadFiles({action: '/upload', files: [first, second, third]})).rejects.toMatchObject({
      confirmedFiles: [expect.objectContaining({file: first, url: '/files/one.txt'})],
      unconfirmedFile: expect.objectContaining({file: second, name: 'two.txt'}),
    })
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('treats an empty explicit selection as cancel without making a request', async () => {
    await expect(buildPageService(router()).uploadFiles({action: '/upload', files: []})).resolves.toEqual([])
    expect(post).not.toHaveBeenCalled()
  })

  it('preserves a host upload provider contract when it confirms a file by a non-URL reference', async () => {
    const confirmed = {name: 'confirmed-file-id', file: file('one.txt'), size: 7, type: 'text/plain', lastModified: 1, response: {id: 'confirmed-file-id'}}
    const uploadFiles = vi.fn(async () => [confirmed])
    await expect(buildPageService(router(), {pageService: {uploadFiles}}).uploadFiles({action: '/upload', files: [confirmed.file]})).resolves.toEqual([confirmed])
    expect(post).not.toHaveBeenCalled()
  })
})
