/**
 * 模块职责：在内存中补全包装类型、构建 Schema 并校验所有 Operation。
 *
 * 输入：SDL 分析结果、规范化配置、Operation 文档列表。
 * 输出：补全后的 GraphQLSchema；校验失败时抛出 CodegenError。
 * 关键约束：
 *   - 包装类型只存在于内存字符串中，绝不写回 .graphql、也不进入 typeDefs 输出；
 *   - 包装目标类型不存在必须报 E004 并指明字段与目标类型；
 *   - Operation 校验失败必须报 E007 并指明 Operation 名称与 GraphQL 错误。
 */
import { buildSchema, validate } from 'graphql'
import { CodegenError } from './errors.mjs'

/** GraphQL 内建标量，允许作为包装指令的 for 目标而无需在 SDL 中声明 */
const BUILTIN_SCALAR_NAMES = new Set(['String', 'Boolean', 'Int', 'Float', 'ID'])

/**
 * 构建内存中补全后的 Schema。
 *
 * @param {object} analysis analyzeSdl 的返回值
 * @param {object} config 规范化配置
 * @returns {import('graphql').GraphQLSchema} 补全后的 Schema
 */
export function buildCompletedSchema(analysis, config) {
  const { files, rootFields, typeDefs, scalarNames } = analysis
  const synthesizedTypes = new Map()

  for (const field of rootFields) {
    const wrapper = field.wrapper
    if (!wrapper) {
      continue
    }

    // 包装类型不能与 Schema 中已声明的类型重名，否则 buildSchema 会因重复定义失败
    if (typeDefs.has(field.returnTypeName)) {
      throw new CodegenError(
        'E004',
        `字段 ${field.name} 的包装返回类型 ${field.returnTypeName} 与 Schema 类型重名`,
        [field.sourceFileName],
      )
    }

    if (!isKnownTargetType(wrapper.target, typeDefs, scalarNames, config)) {
      throw new CodegenError(
        'E004',
        `字段 ${field.name} 的 @${wrapper.kind === 'page' ? 'page' : 'commonBusinessResponse'}(for: "${wrapper.target}") 目标类型不存在`,
        [field.sourceFileName],
      )
    }

    const synthesized = synthesizeWrapperType({ ...wrapper, returnTypeName: field.returnTypeName })
    const existing = synthesizedTypes.get(field.returnTypeName)
    if (existing && existing !== synthesized) {
      throw new CodegenError('E004', `包装类型 ${field.returnTypeName} 存在不一致的合成定义`, [
        field.sourceFileName,
      ])
    }
    synthesizedTypes.set(field.returnTypeName, synthesized)
  }

  const sdl = [
    ...files.map((file) => file.source.trim()),
    ...synthesizedTypes.values(),
  ].join('\n\n')

  try {
    return buildSchema(sdl)
  } catch (error) {
    throw new CodegenError('E004', '内存 Schema 构建失败', [error.message])
  }
}

/**
 * 判断包装指令的 for 目标是否为已声明的类型或标量。
 *
 * @param {string} targetName 目标类型名
 * @param {Map<string, object>} typeDefs 类型定义表
 * @param {Set<string>} scalarNames SDL 声明的标量集合
 * @param {object} config 规范化配置
 * @returns {boolean} 是否存在
 */
function isKnownTargetType(targetName, typeDefs, scalarNames, config) {
  return (
    typeDefs.has(targetName) ||
    scalarNames.has(targetName) ||
    BUILTIN_SCALAR_NAMES.has(targetName) ||
    // 运行期注入的 GraphQL 包装类型规则中，for 目标也可能映射为配置了 TS 映射的标量
    Boolean(config.scalars[targetName])
  )
}

/**
 * 合成包装类型的 SDL 文本。
 *
 * 字段顺序与 Runtime 注入类型保持一致（设计文档 4.2 / 7.4）：
 *   business → data / code / message；
 *   page     → currentPageData / totalSize / pageNo / pageSize。
 *
 * @param {{kind: 'business' | 'page', target: string, returnTypeName: string}} wrapper 包装信息
 * @returns {string} 合成 SDL 片段
 */
function synthesizeWrapperType(wrapper) {
  if (wrapper.kind === 'page') {
    return [
      `type ${wrapper.returnTypeName} {`,
      `    currentPageData: [${wrapper.target}]`,
      '    totalSize: Long',
      '    pageNo: Long',
      '    pageSize: Long',
      '}',
    ].join('\n')
  }

  return [
    `type ${wrapper.returnTypeName} {`,
    `    data: ${wrapper.target}`,
    '    code: String',
    '    message: String',
    '}',
  ].join('\n')
}

/**
 * 使用补全后的 Schema 校验所有 Operation。
 *
 * @param {import('graphql').GraphQLSchema} schema 补全后的 Schema
 * @param {Array<{field: object, fileName: string, document: import('graphql').DocumentNode}>} operations Operation 列表
 */
export function validateOperationDocuments(schema, operations) {
  const problems = []

  for (const operation of operations) {
    let errors
    try {
      errors = validate(schema, operation.document)
    } catch (error) {
      // graphql.validate 会先执行 Schema 有效性检查（如根类型必须存在字段），
      // 这类问题属于 Schema 构建缺陷，统一按 E004 报错
      throw new CodegenError('E004', '内存 Schema 校验失败', [error.message])
    }
    for (const error of errors) {
      problems.push(`Operation ${operation.field.name}（${operation.fileName}）: ${error.message}`)
    }
  }

  if (problems.length > 0) {
    throw new CodegenError('E007', 'Operation 校验失败', problems)
  }
}
