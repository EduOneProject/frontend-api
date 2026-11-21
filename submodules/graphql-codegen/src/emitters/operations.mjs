/**
 * 模块职责：生成每个根字段对应的 `.graphql` Operation 文件。
 *
 * 输入：根字段列表、类型定义表。
 * 输出：
 *   - `Map<'operations/<SDL名>.<Query|Mutation>.<字段名>.graphql', GraphQL 文本>`；
 *   - Operation 文档列表，供 Schema 校验与方法文件引用。
 * 关键约束：
 *   - 文件命名格式固定，重复必须报 E009；
 *   - Operation 名称必须与字段名一致，变量与实参按名称绑定；
 *   - object 递归选择所有不需要参数的字段；存在必填参数字段时报 E008；
 *   - 生成后必须经 graphql.print 统一格式化。
 */
import { Kind, parse, print } from 'graphql'
import { CodegenError } from '../errors.mjs'
import { namedTypeName } from '../type-resolver.mjs'

/**
 * 生成全部 Operation 文件。
 *
 * @param {{rootFields: object[], typeDefs: Map<string, object>}} input 生成输入
 * @returns {{files: Map<string, string>, operations: Array<{field: object, fileName: string, relativePath: string, document: import('graphql').DocumentNode}>}}
 */
export function emitOperations({ rootFields, typeDefs }) {
  const files = new Map()
  const operations = []

  // 设计文档 12：Operation 文件按 Query、Mutation 分组，组内保持 SDL 定义顺序
  const orderedFields = [
    ...rootFields.filter((field) => field.operationType === 'Query'),
    ...rootFields.filter((field) => field.operationType === 'Mutation'),
  ]

  for (const field of orderedFields) {
    const fileName = buildOperationFileName(field)
    const relativePath = `operations/${fileName}`
    if (files.has(relativePath)) {
      throw new CodegenError('E009', `Operation 文件名重复: ${fileName}`, [
        `来源字段: ${field.name}`,
        `来源文件: ${field.sourceFileName}`,
      ])
    }

    const source = buildOperationSource(field, typeDefs)
    let document
    try {
      document = parse(source)
    } catch (error) {
      throw new CodegenError('E007', `Operation 文本解析失败: ${field.name}`, [
        field.sourceFileName,
        error.message,
      ])
    }

    files.set(relativePath, `${print(document)}\n`)
    operations.push({ field, fileName, relativePath, document })
  }

  return { files, operations }
}

/**
 * 生成 Operation 文件名。
 *
 * 格式固定为 `<SDL文件名去后缀>.<Query|Mutation>.<字段名>.graphql`。
 *
 * @param {object} field 根字段
 * @returns {string} 文件名
 */
export function buildOperationFileName(field) {
  return `${field.sourceBaseName}.${field.operationType}.${field.name}.graphql`
}

/**
 * 构造 Operation 文本（未格式化）。
 *
 * @param {object} field 根字段
 * @param {Map<string, object>} typeDefs 类型定义表
 * @returns {string} GraphQL 文本
 */
function buildOperationSource(field, typeDefs) {
  const variables = field.args.map((arg) => `$${arg.name.value}: ${print(arg.type)}`)
  const bindings = field.args.map((arg) => `${arg.name.value}: $${arg.name.value}`)
  const operationKeyword = field.operationType.toLowerCase()
  const variablePart = variables.length > 0 ? `(${variables.join(', ')})` : ''
  const argumentPart = bindings.length > 0 ? `(${bindings.join(', ')})` : ''
  const selection = renderRootSelection(field, typeDefs)

  return `${operationKeyword} ${field.name}${variablePart} { ${field.name}${argumentPart}${selection} }`
}

/**
 * 渲染根字段的 Selection Set。
 *
 * @param {object} field 根字段
 * @param {Map<string, object>} typeDefs 类型定义表
 * @returns {string} 形如 ` { data { id } code message }` 的 Selection 文本；叶子字段返回空字符串
 */
function renderRootSelection(field, typeDefs) {
  if (field.wrapper?.kind === 'business') {
    // 业务包装必须选择 data / code / message；data 为 object 时继续递归
    const dataSelection = renderSelectionBlock(field.wrapper.target, typeDefs, [])
    return ` { data${dataSelection} code message }`
  }

  if (field.wrapper?.kind === 'page') {
    // 分页包装固定选择 currentPageData / totalSize / pageNo / pageSize
    const listSelection = renderSelectionBlock(field.wrapper.target, typeDefs, [])
    return ` { currentPageData${listSelection} totalSize pageNo pageSize }`
  }

  return renderSelectionBlock(namedTypeName(field.returnType), typeDefs, [])
}

/**
 * 渲染类型对应的 Selection 块。
 *
 * @param {string} typeName 类型名
 * @param {Map<string, object>} typeDefs 类型定义表
 * @param {string[]} stack 递归路径，用于循环引用检测
 * @returns {string} 形如 ` { id name }` 的文本；标量 / 枚举返回空字符串
 */
function renderSelectionBlock(typeName, typeDefs, stack) {
  const fields = renderSelectionFields(typeName, typeDefs, stack)
  return fields ? ` { ${fields} }` : ''
}

/**
 * 递归渲染 object 类型的字段选择。
 *
 * @param {string} typeName 类型名
 * @param {Map<string, object>} typeDefs 类型定义表
 * @param {string[]} stack 递归路径
 * @returns {string | null} 以空格分隔的 Selection 字段；非 object 类型返回 null
 */
function renderSelectionFields(typeName, typeDefs, stack) {
  const definition = typeDefs.get(typeName)
  if (!definition || definition.kind !== 'object') {
    return null
  }

  if (stack.includes(typeName)) {
    throw new CodegenError('E008', `类型 ${typeName} 存在循环引用，无法自动生成 Selection Set`, [
      `引用链: ${[...stack, typeName].join(' -> ')}`,
    ])
  }

  const selections = []
  for (const field of definition.fields) {
    const requiredArgument = field.args.find(
      (arg) => arg.type.kind === Kind.NON_NULL_TYPE && arg.defaultValue === undefined,
    )
    if (requiredArgument) {
      throw new CodegenError('E008', `类型 ${typeName} 的字段 ${field.name} 需要必填参数 ${requiredArgument.name.value}`, [
        `类型: ${typeName}`,
        `字段: ${field.name}`,
      ])
    }
    // 带可选参数的字段无法自动提供实参，直接跳过，避免生成非法 Operation
    if (field.args.length > 0) {
      continue
    }

    const nested = renderSelectionFields(namedTypeName(field.type), typeDefs, [...stack, typeName])
    selections.push(nested ? `${field.name} { ${nested} }` : field.name)
  }

  return selections.join(' ')
}
