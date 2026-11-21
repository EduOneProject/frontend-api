/**
 * 测试：SDL 描述解析与 JSDoc 渲染。
 *
 * 覆盖设计文档 7.8 的 @param / @return / @see 解析规则与 `{@link}` 转换边界。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDescription,
  renderDescriptionJsDoc,
  renderInlineJsDoc,
  renderMethodJsDoc,
  transformSee,
} from '../../src/doc.mjs'

/**
 * 构造 `@see` 解析上下文。
 *
 * @returns {{fqcnToTypeName: Map<string, string>, knownTypeNames: Set<string>}}
 */
function createSeeContext() {
  return {
    fqcnToTypeName: new Map([
      ['io.example.SampleResponse', 'SampleResponse'],
      ['io.example.deep.NestedThing', 'NestedThing'],
    ]),
    knownTypeNames: new Set(['SampleResponse', 'NestedThing', 'SampleStatus']),
  }
}

test('描述解析：正文、@param、@return 与 @see 分离', () => {
  const parsed = parseDescription([
    '以密码方式登录',
    '',
    '@param request 登录请求参数',
    '@param token',
    '@return 登录结果',
    '@see SampleResponse',
    '@author summerain0',
  ].join('\n'))

  assert.deepEqual(parsed.body, ['以密码方式登录', '', '@author summerain0'])
  assert.deepEqual(parsed.params, [
    { name: 'request', description: '登录请求参数' },
    { name: 'token', description: '' },
  ])
  assert.equal(parsed.returns, '登录结果')
  assert.deepEqual(parsed.sees, ['SampleResponse'])
})

test('描述解析：空描述返回空结构', () => {
  assert.deepEqual(parseDescription(undefined), {
    body: [],
    params: [],
    returns: null,
    sees: [],
  })
})

test('@see：简单名命中 Schema 类型时转换为 {@link}', () => {
  assert.equal(transformSee('SampleResponse', createSeeContext()), '{@link SampleResponse}')
})

test('@see：简单名未命中时保持原样', () => {
  assert.equal(transformSee('UnknownThing', createSeeContext()), 'UnknownThing')
})

test('@see：全限定名整体精确匹配时替换', () => {
  assert.equal(
    transformSee('io.example.SampleResponse', createSeeContext()),
    '{@link SampleResponse}',
  )
})

test('@see：全限定名未命中时整段保留，禁止部分替换', () => {
  const context = createSeeContext()
  assert.equal(
    transformSee('io.github.eduoneproject.eduone.unknown.UnknownThing', context),
    'io.github.eduoneproject.eduone.unknown.UnknownThing',
  )
})

test('@see：已有 {@link} 原样保留，同句中的简单名仍可转换', () => {
  const context = createSeeContext()
  assert.equal(
    transformSee('参见 {@link SampleResponse} 与 SampleStatus', context),
    '参见 {@link SampleResponse} 与 {@link SampleStatus}',
  )
})

test('方法 JSDoc：正文、空行、参数、返回值与 @see 的顺序稳定', () => {
  const description = [
    '以密码方式登录',
    '',
    '@param request 登录请求参数',
    '@return 登录结果',
    '@see SampleResponse',
  ].join('\n')

  const jsdoc = renderMethodJsDoc(description, ['request'], createSeeContext(), '    ')
  assert.equal(jsdoc, [
    '    /**',
    '     * 以密码方式登录',
    '     *',
    '     * @param request 登录请求参数',
    '     * @returns 登录结果',
    '     * @see {@link SampleResponse}',
    '     */',
  ].join('\n'))
})

test('方法 JSDoc：缺少描述的参数至少输出 @param 名称', () => {
  const jsdoc = renderMethodJsDoc(undefined, ['page', 'sortList'], createSeeContext(), '  ')
  assert.equal(jsdoc, [
    '  /**',
    '   * @param page',
    '   * @param sortList',
    '   */',
  ].join('\n'))
})

test('方法 JSDoc：字段无描述且无参数时不输出注释', () => {
  assert.equal(renderMethodJsDoc(undefined, [], createSeeContext()), '')
})

test('类型描述 JSDoc：保留正文与自定义标签', () => {
  assert.equal(
    renderDescriptionJsDoc('业务字典信息响应体\n@deprecated 即将废弃', '  '),
    ['  /**', '   * 业务字典信息响应体', '   * @deprecated 即将废弃', '   */'].join('\n'),
  )
})

test('枚举值 JSDoc：单行描述输出内联注释', () => {
  assert.equal(renderInlineJsDoc('升序', '  '), '  /** 升序 */')
})
