/**
 * 模块职责：分析 SDL AST，产出类型定义、根字段、包装指令与 FQCN 映射。
 *
 * 输入：sdl-loader 产出的文件列表、规范化配置。
 * 输出：
 *   - `typeDefs`：object / input / enum 类型定义（不含 Query / Mutation）；
 *   - `scalarNames`：SDL 中显式声明的标量；
 *   - `rootFields`：Query / Mutation 根字段，携带来源文件名与包装信息；
 *   - `wrappers`：包装返回类型名 → `{kind, target}`；
 *   - `fqcnToTypeName`：`@type` 的 Java FQCN → GraphQL 类型名；
 *   - `knownTypeNames`：供 `@see` 简单名解析使用的类型名集合。
 * 关键约束：
 *   - 同一 FQCN 映射到多个 GraphQL 类型必须报 E005；
 *   - Schema 类型命中保留名必须报 E006；
 *   - 同一字段同时使用两个包装指令、重复定义类型等必须报 E004。
 */
import { Kind } from 'graphql'
import { CodegenError } from './errors.mjs'
import { namedTypeName } from './type-resolver.mjs'

const ROOT_TYPE_NAMES = new Set(['Query', 'Mutation'])
const WRAPPER_DIRECTIVE_NAMES = new Set(['commonBusinessResponse', 'page'])

/**
 * 分析 SDL 文件集合。
 *
 * @param {Array<{fileName: string, baseName: string, source: string, document: import('graphql').DocumentNode}>} files SDL 文件列表
 * @param {object} config 规范化配置
 * @returns {{
 *   typeDefs: Map<string, object>,
 *   scalarNames: Set<string>,
 *   rootFields: object[],
 *   wrappers: Map<string, object>,
 *   fqcnToTypeName: Map<string, string>,
 *   knownTypeNames: Set<string>
 * }}
 */
export function analyzeSdl(files, config) {
  const context = {
    config,
    typeDefs: new Map(),
    scalarNames: new Set(),
    rootFields: [],
    rootFieldNames: new Map([
      ['Query', new Set()],
      ['Mutation', new Set()],
    ]),
    wrappers: new Map(),
    fqcnToTypeName: new Map(),
  }

  for (const file of files) {
    for (const definition of file.document.definitions) {
      switch (definition.kind) {
        case Kind.OBJECT_TYPE_DEFINITION:
        case Kind.OBJECT_TYPE_EXTENSION:
          collectObjectDefinition(definition, file, context)
          break
        case Kind.INPUT_OBJECT_TYPE_DEFINITION:
          registerTypeDef(definition, 'input', file, context)
          break
        case Kind.ENUM_TYPE_DEFINITION:
          registerTypeDef(definition, 'enum', file, context)
          break
        case Kind.SCALAR_TYPE_DEFINITION:
          context.scalarNames.add(definition.name.value)
          break
        case Kind.DIRECTIVE_DEFINITION:
          // 指令声明本身不参与代码生成
          break
        default:
          throw new CodegenError('E004', `不支持的 SDL 定义: ${definition.kind}`, [file.fileName])
      }
    }
  }

  return {
    files,
    typeDefs: context.typeDefs,
    scalarNames: context.scalarNames,
    rootFields: context.rootFields,
    wrappers: context.wrappers,
    fqcnToTypeName: context.fqcnToTypeName,
    knownTypeNames: new Set(context.typeDefs.keys()),
  }
}

/**
 * 处理对象类型定义或扩展。
 *
 * `type Query` / `extend type Query` 等根类型收集为根字段，其余对象类型登记为类型定义。
 *
 * @param {object} definition ObjectTypeDefinition / ObjectTypeExtension 节点
 * @param {{fileName: string, baseName: string}} file 来源文件
 * @param {object} context 分析上下文
 */
function collectObjectDefinition(definition, file, context) {
  const typeName = definition.name.value

  if (ROOT_TYPE_NAMES.has(typeName)) {
    collectRootFields(definition, file, context)
    return
  }

  if (definition.kind === Kind.OBJECT_TYPE_EXTENSION) {
    throw new CodegenError('E004', `不支持的对象类型扩展: ${typeName}`, [file.fileName])
  }

  registerTypeDef(definition, 'object', file, context)
}

/**
 * 收集 Query / Mutation 根字段。
 *
 * @param {object} definition 根类型定义或扩展节点
 * @param {{fileName: string, baseName: string}} file 来源文件
 * @param {object} context 分析上下文
 */
function collectRootFields(definition, file, context) {
  const operationType = definition.name.value
  const seenNames = context.rootFieldNames.get(operationType)

  for (const field of definition.fields ?? []) {
    const fieldName = field.name.value
    if (seenNames.has(fieldName)) {
      throw new CodegenError('E004', `根字段重复定义: ${operationType}.${fieldName}`, [file.fileName])
    }
    seenNames.add(fieldName)

    const wrapper = detectWrapper(field, file.fileName)
    const returnTypeName = namedTypeName(field.type)

    context.rootFields.push({
      operationType,
      name: fieldName,
      description: field.description?.value,
      args: field.arguments ?? [],
      returnType: field.type,
      returnTypeName,
      wrapper,
      sourceBaseName: file.baseName,
      sourceFileName: file.fileName,
    })

    if (wrapper) {
      const existing = context.wrappers.get(returnTypeName)
      if (existing && (existing.kind !== wrapper.kind || existing.target !== wrapper.target)) {
        throw new CodegenError(
          'E004',
          `包装返回类型 ${returnTypeName} 被多个字段以不同语义使用`,
          [
            `字段: ${operationType}.${fieldName}（${file.fileName}）`,
            `已有: @${existing.kind} for "${existing.target}"`,
          ],
        )
      }
      context.wrappers.set(returnTypeName, {
        ...wrapper,
        returnTypeName,
        fieldName,
        sourceFileName: file.fileName,
      })
    }
  }
}

/**
 * 读取字段上的包装指令。
 *
 * @param {object} field FieldDefinition 节点
 * @param {string} fileName 来源文件名，用于错误信息
 * @returns {{kind: 'business' | 'page', target: string} | undefined} 包装信息
 */
function detectWrapper(field, fileName) {
  const found = []

  for (const directive of field.directives ?? []) {
    const directiveName = directive.name.value
    if (!WRAPPER_DIRECTIVE_NAMES.has(directiveName)) {
      continue
    }

    const targetArgument = (directive.arguments ?? []).find((arg) => arg.name.value === 'for')
    if (!targetArgument || targetArgument.value.kind !== Kind.STRING) {
      throw new CodegenError('E004', `字段 ${field.name.value} 的 @${directiveName} 缺少字符串 for 参数`, [
        fileName,
      ])
    }

    found.push({
      kind: directiveName === 'page' ? 'page' : 'business',
      target: targetArgument.value.value,
    })
  }

  if (found.length > 1) {
    throw new CodegenError('E004', `字段 ${field.name.value} 同时使用了多个包装指令`, [fileName])
  }

  return found[0]
}

/**
 * 登记 object / input / enum 类型定义。
 *
 * @param {object} definition 类型定义节点
 * @param {'object' | 'input' | 'enum'} kind 类型种类
 * @param {{fileName: string}} file 来源文件
 * @param {object} context 分析上下文
 */
function registerTypeDef(definition, kind, file, context) {
  const name = definition.name.value

  if (context.config.reservedTypeNames.has(name)) {
    throw new CodegenError('E006', `Schema 类型名与生成器保留名冲突: ${name}`, [
      `保留名: ${name}`,
      `来源文件: ${file.fileName}`,
    ])
  }

  if (context.typeDefs.has(name)) {
    throw new CodegenError('E004', `类型重复定义: ${name}`, [
      `来源文件: ${file.fileName}`,
      `已定义于: ${context.typeDefs.get(name).sourceFile}`,
    ])
  }

  const typeValue = readTypeDirective(definition, name, file.fileName, context)

  const typeDef = {
    name,
    kind,
    description: definition.description?.value,
    typeValue,
    sourceFile: file.fileName,
    fields: [],
    values: [],
  }

  if (kind === 'enum') {
    typeDef.values = (definition.values ?? []).map((value) => ({
      name: value.name.value,
      description: value.description?.value,
    }))
  } else {
    typeDef.fields = (definition.fields ?? []).map((field) => ({
      name: field.name.value,
      description: field.description?.value,
      type: field.type,
      args: field.arguments ?? [],
    }))
  }

  context.typeDefs.set(name, typeDef)
}

/**
 * 读取并登记 `@type(value: "...")` 指令。
 *
 * @param {object} definition 类型定义节点
 * @param {string} typeName GraphQL 类型名
 * @param {string} fileName 来源文件名
 * @param {object} context 分析上下文
 * @returns {string | undefined} Java FQCN
 */
function readTypeDirective(definition, typeName, fileName, context) {
  const directive = (definition.directives ?? []).find((item) => item.name.value === 'type')
  if (!directive) {
    return undefined
  }

  const valueArgument = (directive.arguments ?? []).find((arg) => arg.name.value === 'value')
  if (!valueArgument || valueArgument.value.kind !== Kind.STRING) {
    throw new CodegenError('E004', `类型 ${typeName} 的 @type 必须提供字符串 value`, [fileName])
  }

  const fqcn = valueArgument.value.value
  const existing = context.fqcnToTypeName.get(fqcn)
  if (existing && existing !== typeName) {
    throw new CodegenError('E005', `@type 重复映射: ${fqcn}`, [
      `已有类型: ${existing}`,
      `冲突类型: ${typeName}`,
      `来源文件: ${fileName}`,
    ])
  }

  context.fqcnToTypeName.set(fqcn, typeName)
  return fqcn
}
