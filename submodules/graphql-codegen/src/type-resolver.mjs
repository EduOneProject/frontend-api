/**
 * 模块职责：GraphQL 类型 AST 到 TypeScript 类型的映射。
 *
 * 输入：GraphQL TypeNode、标量映射表、类型定义表。
 * 输出：TypeScript 类型字符串（含可空与列表组合），以及方法参数声明。
 * 关键约束：
 *   - 可空规则严格遵循设计文档 7.5.1 的组合表；
 *   - 可空输入对象按内部字段是否全部可空，分别生成 `= {}` 或 `= null` 默认值（7.7）；
 *   - 枚举、对象、输入类型直接引用 Schema 类型名，不生成额外 DTO。
 */
import { Kind } from 'graphql'

/**
 * 取 TypeNode 最内层的命名类型名。
 *
 * @param {import('graphql').TypeNode} typeNode GraphQL 类型节点
 * @returns {string} 命名类型，如 `String`、`BusinessDictionaryResponse`
 */
export function namedTypeName(typeNode) {
  let current = typeNode
  while (current.kind === Kind.NON_NULL_TYPE || current.kind === Kind.LIST_TYPE) {
    current = current.type
  }
  return current.name.value
}

/**
 * 渲染 GraphQL 类型为 TypeScript 类型。
 *
 * @param {import('graphql').TypeNode} typeNode GraphQL 类型节点
 * @param {{scalars: Record<string, string>, typeDefs: Map<string, object>}} context 类型上下文
 * @returns {string} TypeScript 类型字符串
 */
export function renderTsType(typeNode, context) {
  if (typeNode.kind === Kind.NON_NULL_TYPE) {
    return renderNonNullType(typeNode.type, context)
  }
  return `${renderNonNullType(typeNode, context)} | null`
}

/**
 * 渲染非空类型。
 *
 * 列表统一输出为 Array<T>，内部元素的可空性由递归结果决定，
 * 例如 [T] 先渲染内层 `T | null`，再包成 `Array<T | null>`。
 *
 * @param {import('graphql').TypeNode} typeNode 非空语义下的类型节点
 * @param {{scalars: Record<string, string>, typeDefs: Map<string, object>}} context 类型上下文
 * @returns {string} TypeScript 类型字符串
 */
function renderNonNullType(typeNode, context) {
  if (typeNode.kind === Kind.LIST_TYPE) {
    return `Array<${renderTsType(typeNode.type, context)}>`
  }
  return resolveNamedType(typeNode.name.value, context)
}

/**
 * 解析命名类型对应的 TypeScript 名称。
 *
 * @param {string} name GraphQL 类型名
 * @param {{scalars: Record<string, string>, typeDefs: Map<string, object>}} context 类型上下文
 * @returns {string} TypeScript 类型名
 */
function resolveNamedType(name, context) {
  const scalarType = context.scalars[name]
  if (scalarType) {
    return scalarType
  }
  const definition = context.typeDefs.get(name)
  if (definition) {
    return definition.name
  }
  // 未在 SDL 中声明且未配置映射的类型，退化为 unknown，避免生成非法标识符
  return 'unknown'
}

/**
 * 判断输入对象字段是否全部可空。
 *
 * @param {{fields: Array<{type: import('graphql').TypeNode}>}} inputDefinition 输入类型定义
 * @returns {boolean} 全部可空时为 true（含零字段场景）
 */
export function allInputFieldsOptional(inputDefinition) {
  return inputDefinition.fields.every((field) => field.type.kind !== Kind.NON_NULL_TYPE)
}

/**
 * 生成方法参数声明（含默认值）。
 *
 * 规则来自设计文档 7.7：
 *   - 非空参数必填；
 *   - 可空 input object 且字段全部可空 → `= {}`；
 *   - 可空 input object 但存在必填字段 → `| null = null`；
 *   - 其余可空类型 → `= null`。
 *
 * @param {import('graphql').ArgumentNode} argument GraphQL 参数节点
 * @param {{scalars: Record<string, string>, typeDefs: Map<string, object>}} context 类型上下文
 * @returns {string} 形如 `request: LoginWithPasswordRequest = {}` 的参数声明
 */
export function renderArgument(argument, context) {
  const name = argument.name.value
  if (argument.type.kind === Kind.NON_NULL_TYPE) {
    return `${name}: ${renderTsType(argument.type, context)}`
  }

  // 仅“可空命名输入对象”适用默认 {} / null 的规则；列表参数一律默认 null
  if (argument.type.kind === Kind.NAMED_TYPE) {
    const typeName = argument.type.name.value
    const definition = context.typeDefs.get(typeName)
    if (definition?.kind === 'input') {
      if (allInputFieldsOptional(definition)) {
        return `${name}: ${typeName} = {}`
      }
      return `${name}: ${typeName} | null = null`
    }
  }

  return `${name}: ${renderTsType(argument.type, context)} = null`
}
