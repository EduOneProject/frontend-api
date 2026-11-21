/**
 * 模块职责：生成 `types/enums`、`types/inputs`、`types/outputs` 与 `types/index.ts`。
 *
 * 输入：SDL 类型定义表、规范化配置。
 * 输出：`Map<相对路径, 文件内容>`。
 * 关键约束：
 *   - 类型按名称排序输出，保证确定性；
 *   - `CommonBusinessResponse<T>` / `Page<T>` 固定写入且注释来自 Java 源码；
 *   - 不输出 `BooleanBusinessResponse`、`...DataPage` 等运行时内部类型；
 *   - 输入字段可空时输出可选属性 `field?: T | null`。
 */
import { Kind } from 'graphql'
import { renderDescriptionJsDoc, renderInlineJsDoc } from '../doc.mjs'
import { namedTypeName, renderTsType } from '../type-resolver.mjs'

/**
 * 固定泛型包装类型的文档来源与字段顺序。
 *
 * 来源（Java）：
 *   - backend/eduone-business-gateway/src/main/java/io/github/eduoneproject/eduone/business/gateway/response/CommonBusinessResponse.java
 *   - backend/eduone-common/src/main/java/io/github/eduoneproject/eduone/common/domain/DataPage.java
 *
 * 约束：字段顺序必须与 Java 声明顺序一致；Page 不包含 Java 计算属性 totalPage。
 * Java 注释变更时必须同步更新本常量，并由 Golden Test 锁定。
 */
export const BUILTIN_TYPE_DOCS = {
  businessResponse: {
    description: '通用业务响应体',
    fields: [
      { name: 'code', type: 'string | null', description: '响应码' },
      { name: 'message', type: 'string | null', description: '响应消息' },
      { name: 'data', type: 'T | null', description: '响应数据' },
    ],
  },
  page: {
    description: '分页信息',
    fields: [
      { name: 'pageNo', type: 'number | null', description: '当前页' },
      { name: 'pageSize', type: 'number | null', description: '每页数据数量' },
      { name: 'currentPageData', type: 'Array<T | null> | null', description: '当前页数据信息' },
      { name: 'totalSize', type: 'number | null', description: '总数量' },
    ],
  },
}

/**
 * 生成类型目录下的全部文件。
 *
 * @param {{typeDefs: Map<string, object>, config: object}} input 生成输入
 * @returns {Map<string, string>} 相对路径 → 文件内容
 */
export function emitTypes({ typeDefs, config }) {
  const sortedDefinitions = [...typeDefs.values()].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )

  const files = new Map()
  files.set(
    'types/enums/index.ts',
    renderEnums(sortedDefinitions.filter((definition) => definition.kind === 'enum'), config),
  )
  files.set(
    'types/inputs/index.ts',
    renderInputs(sortedDefinitions.filter((definition) => definition.kind === 'input'), typeDefs, config),
  )
  files.set(
    'types/outputs/index.ts',
    renderOutputs(sortedDefinitions.filter((definition) => definition.kind === 'object'), typeDefs, config),
  )
  files.set('types/index.ts', renderTypesIndex(config))
  return files
}

/**
 * 生成枚举文件。
 *
 * @param {object[]} definitions 枚举类型定义
 * @param {object} config 规范化配置
 * @returns {string} 文件内容
 */
function renderEnums(definitions, config) {
  const sections = []
  for (const definition of definitions) {
    const lines = []
    const description = renderDescriptionJsDoc(definition.description)
    if (description) {
      lines.push(description)
    }
    lines.push(`export type ${definition.name} =`)
    definition.values.forEach((value, index) => {
      const valueDoc = renderInlineJsDoc(value.description, '  ')
      if (valueDoc) {
        lines.push(valueDoc)
      }
      const terminator = index === definition.values.length - 1 ? ';' : ''
      lines.push(`  | '${value.name}'${terminator}`)
    })
    sections.push(lines.join('\n'))
  }

  return assembleFile(config, [], sections)
}

/**
 * 生成输入类型文件。
 *
 * @param {object[]} definitions 输入类型定义
 * @param {Map<string, object>} typeDefs 全部类型定义
 * @param {object} config 规范化配置
 * @returns {string} 文件内容
 */
function renderInputs(definitions, typeDefs, config) {
  const context = { scalars: config.scalars, typeDefs }
  const enumImports = collectReferencedEnums(definitions, typeDefs)
  const imports = enumImports.length > 0
    ? [`import type { ${enumImports.join(', ')} } from '../enums'`]
    : []

  const sections = definitions.map((definition) =>
    renderInterface(definition, 'input', context, config),
  )
  return assembleFile(config, imports, sections)
}

/**
 * 生成输出类型文件（含固定泛型包装）。
 *
 * @param {object[]} definitions 对象类型定义
 * @param {Map<string, object>} typeDefs 全部类型定义
 * @param {object} config 规范化配置
 * @returns {string} 文件内容
 */
function renderOutputs(definitions, typeDefs, config) {
  const context = { scalars: config.scalars, typeDefs }
  const enumImports = collectReferencedEnums(definitions, typeDefs)
  const imports = enumImports.length > 0
    ? [`import type { ${enumImports.join(', ')} } from '../enums'`]
    : []

  const sections = [
    renderGenericInterface(config.genericNames.businessResponse, BUILTIN_TYPE_DOCS.businessResponse),
    renderGenericInterface(config.genericNames.page, BUILTIN_TYPE_DOCS.page),
    ...definitions.map((definition) => renderInterface(definition, 'output', context, config)),
  ]
  return assembleFile(config, imports, sections)
}

/**
 * 生成 `types/index.ts`。
 *
 * @param {object} config 规范化配置
 * @returns {string} 文件内容
 */
function renderTypesIndex(config) {
  return assembleFile(config, [], [
    ["export * from './enums'", "export * from './inputs'", "export * from './outputs'"].join('\n'),
  ])
}

/**
 * 收集类型字段中引用到的枚举名，用于生成跨文件 import。
 *
 * @param {object[]} definitions 类型定义
 * @param {Map<string, object>} typeDefs 全部类型定义
 * @returns {string[]} 排序后的枚举名
 */
function collectReferencedEnums(definitions, typeDefs) {
  const names = new Set()
  for (const definition of definitions) {
    for (const field of definition.fields) {
      const referenced = namedTypeName(field.type)
      if (typeDefs.get(referenced)?.kind === 'enum') {
        names.add(referenced)
      }
    }
  }
  return [...names].sort()
}

/**
 * 渲染固定泛型接口。
 *
 * @param {string} name 接口名
 * @param {{description: string, fields: Array<{name: string, type: string, description: string}>}} docs 文档定义
 * @returns {string} 接口文本
 */
function renderGenericInterface(name, docs) {
  const lines = ['/**', ` * ${docs.description}`, ' */', `export interface ${name}<T> {`]
  for (const field of docs.fields) {
    lines.push('  /**', `   * ${field.description}`, '   */', `  ${field.name}: ${field.type}`)
  }
  lines.push('}')
  return lines.join('\n')
}

/**
 * 渲染 object / input 接口。
 *
 * @param {object} definition 类型定义
 * @param {'input' | 'output'} mode 生成模式，输入类型可空字段输出可选属性
 * @param {{scalars: Record<string, string>, typeDefs: Map<string, object>}} context 类型上下文
 * @param {object} config 规范化配置
 * @returns {string} 接口文本
 */
function renderInterface(definition, mode, context, config) {
  const lines = []
  const description = renderDescriptionJsDoc(definition.description)
  if (description) {
    lines.push(description)
  }

  lines.push(`export interface ${definition.name} {`)
  for (const field of definition.fields) {
    const fieldDoc = renderDescriptionJsDoc(field.description, '  ')
    if (fieldDoc) {
      lines.push(fieldDoc)
    }
    const optional = mode === 'input' && field.type.kind !== Kind.NON_NULL_TYPE ? '?' : ''
    lines.push(`  ${field.name}${optional}: ${renderTsType(field.type, context)}`)
  }
  lines.push('}')
  return lines.join('\n')
}

/**
 * 组装文件：文件头 + 可选 import + 各段落，统一以单个换行结尾。
 *
 * @param {object} config 规范化配置
 * @param {string[]} imports import 语句
 * @param {string[]} sections 文件段落
 * @returns {string} 文件内容
 */
export function assembleFile(config, imports, sections) {
  const blocks = [config.header.join('\n')]
  if (imports.length > 0) {
    blocks.push(imports.join('\n'))
  }
  blocks.push(...sections.filter((section) => section !== ''))
  return `${blocks.join('\n\n')}\n`
}
