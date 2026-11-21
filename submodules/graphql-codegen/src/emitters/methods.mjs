/**
 * 模块职责：生成 `methods/<SDL名>.ts` 方法工厂文件。
 *
 * 输入：根字段、类型定义、Operation 列表、规范化配置。
 * 输出：`Map<'methods/<SDL名>.ts', 文件内容>` 与方法工厂清单。
 * 关键约束：
 *   - 方法名、入参名、入参顺序与 GraphQL 字段定义完全一致（设计文档 7.7）；
 *   - GraphQL 文本一律通过 `?raw` 从 `operations/` 导入，禁止内联；
 *   - 每次 execute 调用必须显式传入 `method: '<根字段名>'`；
 *   - 方法工厂名或方法名重复必须报 E010。
 */
import { Kind } from 'graphql'
import { CodegenError } from '../errors.mjs'
import { renderMethodJsDoc } from '../doc.mjs'
import { namedTypeName, renderArgument, renderTsType } from '../type-resolver.mjs'
import { assembleFile } from './types.mjs'

/**
 * 生成全部方法文件。
 *
 * @param {{rootFields: object[], typeDefs: Map<string, object>, operations: object[], fqcnToTypeName: Map<string, string>, config: object}} input 生成输入
 * @returns {{files: Map<string, string>, factories: Array<{factoryName: string, baseName: string}>}}
 */
export function emitMethods({ rootFields, typeDefs, operations, fqcnToTypeName, config }) {
  const operationByField = new Map(operations.map((operation) => [operation.field, operation]))

  // 按 Java 侧 SDL 文件名分组，组内保持 SDL 定义顺序
  const groups = new Map()
  for (const field of rootFields) {
    if (!groups.has(field.sourceBaseName)) {
      groups.set(field.sourceBaseName, [])
    }
    groups.get(field.sourceBaseName).push(field)
  }

  const files = new Map()
  const factories = []
  const factoryNames = new Map()
  const methodNames = new Map()

  for (const baseName of [...groups.keys()].sort()) {
    const fields = groups.get(baseName)
    const factoryName = buildFactoryName(baseName)

    if (factoryNames.has(factoryName)) {
      throw new CodegenError('E010', `方法工厂名重复: ${factoryName}`, [
        `来源文件: ${baseName}.graphql`,
        `冲突文件: ${factoryNames.get(factoryName)}.graphql`,
      ])
    }
    factoryNames.set(factoryName, baseName)

    for (const field of fields) {
      if (methodNames.has(field.name)) {
        throw new CodegenError('E010', `方法名重复: ${field.name}`, [
          `来源文件: ${field.sourceFileName}`,
          `冲突文件: ${methodNames.get(field.name)}`,
        ])
      }
      methodNames.set(field.name, field.sourceFileName)
    }

    files.set(
      `methods/${baseName}.ts`,
      renderMethodFile({
        fields,
        factoryName,
        operationByField,
        typeDefs,
        fqcnToTypeName,
        config,
      }),
    )
    factories.push({ factoryName, baseName })
  }

  return { files, factories }
}

/**
 * 由 SDL 文件名生成方法工厂名，如 `AuthMutationResolver` → `createAuthMutationResolverMethods`。
 *
 * @param {string} baseName SDL 文件名（去后缀）
 * @returns {string} 工厂函数名
 */
export function buildFactoryName(baseName) {
  return `create${baseName[0].toUpperCase()}${baseName.slice(1)}Methods`
}

/**
 * 渲染单个方法文件。
 *
 * @param {object} input 渲染输入
 * @returns {string} 文件内容
 */
function renderMethodFile({ fields, factoryName, operationByField, typeDefs, fqcnToTypeName, config }) {
  const context = { scalars: config.scalars, typeDefs }
  const knownTypeNames = new Set(typeDefs.keys())
  const inputNames = new Set()
  const outputNames = new Set()
  const enumNames = new Set()

  for (const field of fields) {
    for (const argument of field.args) {
      collectTypeName(namedTypeName(argument.type), typeDefs, { inputNames, outputNames, enumNames })
    }
    collectReturnTypeNames(field, typeDefs, outputNames, enumNames)
    if (field.wrapper) {
      outputNames.add(
        field.wrapper.kind === 'business'
          ? config.genericNames.businessResponse
          : config.genericNames.page,
      )
    }
  }

  const imports = [`import type { Executor } from '../executor'`]
  if (inputNames.size > 0) {
    imports.push(`import type { ${[...inputNames].sort().join(', ')} } from '../types/inputs'`)
  }
  if (outputNames.size > 0) {
    imports.push(`import type { ${[...outputNames].sort().join(', ')} } from '../types/outputs'`)
  }
  if (enumNames.size > 0) {
    imports.push(`import type { ${[...enumNames].sort().join(', ')} } from '../types/enums'`)
  }
  for (const field of fields) {
    const operation = operationByField.get(field)
    imports.push(`import ${documentName(field)} from '../operations/${operation.fileName}?raw'`)
  }

  const methods = fields.map((field) =>
    renderMethod(operationByField.get(field), context, config, fqcnToTypeName, knownTypeNames),
  )

  const section = [
    `export function ${factoryName}(execute: Executor) {`,
    '  return {',
    methods.join('\n'),
    '  }',
    '}',
  ].join('\n')

  return assembleFile(config, imports, [section])
}

/**
 * 收集方法签名中引用到的类型名。
 *
 * @param {string} typeName GraphQL 类型名
 * @param {Map<string, object>} typeDefs 类型定义表
 * @param {{inputNames: Set<string>, outputNames: Set<string>, enumNames: Set<string>}} bucket 分类集合
 */
function collectTypeName(typeName, typeDefs, bucket) {
  const definition = typeDefs.get(typeName)
  if (!definition) {
    return
  }
  if (definition.kind === 'input') {
    bucket.inputNames.add(typeName)
  } else if (definition.kind === 'enum') {
    bucket.enumNames.add(typeName)
  } else {
    bucket.outputNames.add(typeName)
  }
}

/**
 * 收集根字段返回类型中引用到的类型名（含包装目标）。
 *
 * @param {object} field 根字段
 * @param {Map<string, object>} typeDefs 类型定义表
 * @param {Set<string>} outputNames 输出类型集合
 * @param {Set<string>} enumNames 枚举集合
 */
function collectReturnTypeNames(field, typeDefs, outputNames, enumNames) {
  const typeName = field.wrapper ? field.wrapper.target : namedTypeName(field.returnType)
  const definition = typeDefs.get(typeName)
  if (!definition) {
    return
  }
  if (definition.kind === 'object') {
    outputNames.add(typeName)
  } else if (definition.kind === 'enum') {
    enumNames.add(typeName)
  }
}

/**
 * 计算根字段的 TypeScript 返回类型。
 *
 * `@commonBusinessResponse` / `@page` 翻译为配置的泛型名，不输出运行时内部类型名。
 *
 * @param {object} field 根字段
 * @param {{scalars: Record<string, string>, typeDefs: Map<string, object>}} context 类型上下文
 * @param {object} config 规范化配置
 * @returns {string} TypeScript 返回类型
 */
export function resolveRootReturnType(field, context, config) {
  if (!field.wrapper) {
    return renderTsType(field.returnType, context)
  }

  const inner = config.scalars[field.wrapper.target] ?? field.wrapper.target
  const genericName = field.wrapper.kind === 'business'
    ? config.genericNames.businessResponse
    : config.genericNames.page
  const base = `${genericName}<${inner}>`
  return field.returnType.kind === Kind.NON_NULL_TYPE ? base : `${base} | null`
}

/**
 * 渲染单个方法。
 *
 * @param {object} operation Operation 记录
 * @param {{scalars: Record<string, string>, typeDefs: Map<string, object>}} context 类型上下文
 * @param {object} config 规范化配置
 * @param {Map<string, string>} fqcnToTypeName `@see` 解析映射
 * @param {Set<string>} knownTypeNames Schema 已知类型名
 * @returns {string} 方法文本（含 4 空格缩进与结尾逗号）
 */
function renderMethod(operation, context, config, fqcnToTypeName, knownTypeNames) {
  const field = operation.field
  const declarations = field.args.map((argument) => renderArgument(argument, context))
  const returnType = resolveRootReturnType(field, context, config)
  const description = renderMethodJsDoc(
    field.description,
    field.args.map((argument) => argument.name.value),
    { fqcnToTypeName, knownTypeNames },
    '    ',
  )

  const lines = []
  if (description) {
    lines.push(description)
  }

  lines.push(`    async ${field.name}(${renderParameters(declarations)}): Promise<${returnType}> {`)
  lines.push(`      const data = await execute<Record<string, ${returnType}>>({`)
  lines.push(`        method: '${field.name}',`)
  lines.push(`        query: ${documentName(field)},`)
  if (field.args.length > 0) {
    const variables = field.args.map((argument) => argument.name.value).join(', ')
    lines.push(`        variables: { ${variables} },`)
  }
  lines.push('      })')
  // 项目启用了 noUncheckedIndexedAccess，Record 索引访问可能为 undefined，统一收敛为 null
  lines.push(`      return data.${field.name} ?? null`)
  lines.push('    },')
  return lines.join('\n')
}

/**
 * 渲染参数列表：0/1 个参数单行，2 个及以上多行。
 *
 * @param {string[]} declarations 参数声明
 * @returns {string} 参数列表文本
 */
function renderParameters(declarations) {
  if (declarations.length === 0) {
    return ''
  }
  if (declarations.length === 1) {
    return declarations[0]
  }
  return `\n${declarations.map((declaration) => `      ${declaration},`).join('\n')}\n    `
}

/**
 * 生成 Operation 文档的导入标识符，与根字段名保持一致。
 *
 * @param {object} field 根字段
 * @returns {string} 如 `loginWithPasswordDocument`
 */
function documentName(field) {
  return `${field.name}Document`
}
