// @vitest-environment jsdom
import {describe, expect, it} from 'vitest'
import {sanitizeRichTextHtml} from '@spark-appworks/spark-component'

describe('sanitizeRichTextHtml', () => {
  it('drops dangerous elements entirely and unwraps unknown tags', () => {
    expect(sanitizeRichTextHtml('<div>a<script>x()</script><iframe src="https://e.com"></iframe><custom>b</custom><svg><a>c</a></svg></div>'))
      .toBe('<div>ab</div>')
  })

  it('filters attributes, styles, classes and url protocols', () => {
    expect(sanitizeRichTextHtml('<a href="javascript:alert(1)" onclick="x" target="_top" title="t">l</a>')).toBe('<a title="t">l</a>')
    expect(sanitizeRichTextHtml('<a href="java&#10;script:alert(1)">l</a>')).toBe('<a>l</a>')
    expect(sanitizeRichTextHtml('<a href="/doc" target="_blank">l</a>')).toBe('<a href="/doc" target="_blank" rel="noopener noreferrer">l</a>')
    expect(sanitizeRichTextHtml('<span style="color: red; background: url(x); font-size: 12px; width: expression(1)">s</span>'))
      .toBe('<span style="color: red; font-size: 12px">s</span>')
    expect(sanitizeRichTextHtml('<ul class="task-list foo"><li class="bar">i</li></ul>')).toBe('<ul class="task-list"><li>i</li></ul>')
    expect(sanitizeRichTextHtml('<img src="data:image/png;base64,AAAA"><img src="data:text/html;base64,AAAA"><img src="https://e.com/a.png" srcdoc="x">'))
      .toBe('<img src="data:image/png;base64,AAAA"><img src="https://e.com/a.png">')
    expect(sanitizeRichTextHtml('<table><tbody><tr><td colspan="2" data-colwidth="80">c</td></tr></tbody></table>'))
      .toBe('<table><tbody><tr><td colspan="2" data-colwidth="80">c</td></tr></tbody></table>')
  })

  it('normalizes legacy external-editor markup (link attribute, pm slice, editor classes)', () => {
    expect(sanitizeRichTextHtml('<p data-pm-slice="1 1 []"><a link="https://e.com/x">l</a><a link="javascript:x()">b</a></p>'))
      .toBe('<p><a href="https://e.com/x" target="_blank" rel="noopener noreferrer">l</a><a target="_blank" rel="noopener noreferrer">b</a></p>')
    expect(sanitizeRichTextHtml('<table data-cols="2"><tbody><tr><td class="height-light">c</td></tr></tbody></table><div class="help-block-container"><img src="/Files/a.png"></div>'))
      .toBe('<table><tbody><tr><td>c</td></tr></tbody></table><div><img src="/Files/a.png"></div>')
  })

  it('treats empty paragraphs and non-string input as empty', () => {
    expect(sanitizeRichTextHtml('<p><br></p>')).toBe('')
    expect(sanitizeRichTextHtml(undefined)).toBe('')
    expect(sanitizeRichTextHtml(42)).toBe('')
    expect(sanitizeRichTextHtml('<!-- c --><p>x</p>')).toBe('<p>x</p>')
  })
})
