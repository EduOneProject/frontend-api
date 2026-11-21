/**
 * 测试：GraphQL → TypeScript 类型映射与参数默认值规则。
 *
 * 覆盖设计文档 7.5.1 可空/列表组合表与 7.7 参数默认值规则。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { parse, parseType } from 'graphql'
import { DEFAULT_SCALARS } from '../../src/config.mjs'
import {
  allInputFieldsOptional,
  namedTypeName,
  renderArgument,
  renderTsType,
} from '../../src/type-resolver.mjs'

/**
 * 构造带输入对象与枚举的类型上下文。
 *
 * @returns {{scalars: Record<string, string>, typeDefs: Map<string, object>}}
 */
function createContext() {
  return {
    scalars: { ...DEFAULT_SCALARS },
    typeDefs: new Map([
      ['SampleResponse', { name: 'SampleResponse', kind: 'object', fields: [] }],
      ['AllOptionalInput', {
        name: 'AllOptionalInput',
        kind: 'input',
        fields: [{ name: 'keyword', type: parseType('String') }],
      }],
      ['RequiredInput', {
        name: 'RequiredInput',
        kind: 'input',
        fields: [{ name: 'name', type: parseType('String!') }],
      }],
      ['SampleStatus', { name: 'SampleStatus', kind: 'enum', values: [{ name: 'ENABLED' }] }],
    ]),
  }
}

/**
 * 从内联 SDL 中取出某个字段的参数节点。
 *
 * @param {string} fieldDefinition 形如 `f(a: String): String` 的字段定义（不含外层大括号）
 * @returns {import('graphql').ArgumentNode[]}
 */
function argumentNodes(fieldDefinition) {
  const document = parse(`type Holder { ${fieldDefinition} }`)
  const holder = document.definitions[0]
  return holder.fields[0].arguments ?? []
}

test('类型映射：可空与列表组合表', () => {
  const context = createContext()

  assert.equal(renderTsType(parseType('String'), context), 'string | null')
  assert.equal(renderTsType(parseType('String!'), context), 'string')
  assert.equal(renderTsType(parseType('[String]'), context), 'Array<string | null> | null')
  assert.equal(renderTsType(parseType('[String!]'), context), 'Array<string> | null')
  assert.equal(renderTsType(parseType('[String]!'), context), 'Array<string | null>')
  assert.equal(renderTsType(parseType('[String!]!'), context), 'Array<string>')
  assert.equal(renderTsType(parseType('[[String!]!]!'), context), 'Array<Array<string>>')
})

test('类型映射：标量、对象、枚举与未知类型', () => {
  const context = createContext()

  assert.equal(renderTsType(parseType('Long'), context), 'number | null')
  assert.equal(renderTsType(parseType('DateTime!'), context), 'string')
  assert.equal(renderTsType(parseType('Boolean'), context), 'boolean | null')
  assert.equal(renderTsType(parseType('Int'), context), 'number | null')
  assert.equal(renderTsType(parseType('SampleResponse'), context), 'SampleResponse | null')
  assert.equal(renderTsType(parseType('SampleStatus'), context), 'SampleStatus | null')
  assert.equal(renderTsType(parseType('UnknownThing'), context), 'unknown | null')
})

test('类型映射：namedTypeName 剥离列表与非空包装', () => {
  assert.equal(namedTypeName(parseType('[String!]!')), 'String')
  assert.equal(namedTypeName(parseType('SampleResponse')), 'SampleResponse')
})

test('输入对象：全部字段可空时默认 {}', () => {
  const context = createContext()
  const [argument] = argumentNodes('f(request: AllOptionalInput): String')

  assert.equal(renderArgument(argument, context), 'request: AllOptionalInput = {}')
  assert.equal(allInputFieldsOptional(context.typeDefs.get('AllOptionalInput')), true)
})

test('输入对象：存在必填字段时默认 null', () => {
  const context = createContext()
  const [argument] = argumentNodes('f(request: RequiredInput): String')

  assert.equal(renderArgument(argument, context), 'request: RequiredInput | null = null')
  assert.equal(allInputFieldsOptional(context.typeDefs.get('RequiredInput')), false)
})

test('参数默认值：非空参数必填、列表与标量默认 null', () => {
  const context = createContext()

  const [required] = argumentNodes('f(request: RequiredInput!): String')
  assert.equal(renderArgument(required, context), 'request: RequiredInput')

  const [list] = argumentNodes('f(sortList: [AllOptionalInput]): String')
  assert.equal(renderArgument(list, context), 'sortList: Array<AllOptionalInput | null> | null = null')

  const [enumArgument] = argumentNodes('f(status: SampleStatus): String')
  assert.equal(renderArgument(enumArgument, context), 'status: SampleStatus | null = null')

  const [scalar] = argumentNodes('f(keyword: String): String')
  assert.equal(renderArgument(scalar, context), 'keyword: string | null = null')
})
