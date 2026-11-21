/**
 * 模块职责：加载并校验 graphql-codegen 配置文件。
 *
 * 输入：CLI 传入的配置文件路径（默认当前工作目录下的 graphql-codegen.config.mjs）。
 * 输出：规范化后的配置对象，所有路径均为绝对路径，并补齐所有可选默认值。
 * 关键约束：
 *   - schemaDir / outputDir 必填，相对路径以配置文件所在目录为基准解析；
 *   - 输出必须确定，默认值集中在本文件维护；
 *   - 非法配置必须以 E001 / E002 报错并携带绝对路径。
 */
import { existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CodegenError } from './errors.mjs'

/** 默认 GraphQL 接口地址，写入生成物 executor.ts */
export const DEFAULT_ENDPOINT = '/graphql'

/** 默认文件头，满足设计文档 7.1 的“自动生成”提示要求 */
export const DEFAULT_HEADER = [
  '/* eslint-disable */',
  '// 由 graphql-codegen 自动生成，请勿手动修改',
]

/**
 * 默认标量映射。
 * Long / DateTime / Date 的默认值来自设计文档 7.1；其余为 GraphQL 内建标量的固定映射（7.5）。
 */
export const DEFAULT_SCALARS = {
  String: 'string',
  ID: 'string',
  Boolean: 'boolean',
  Int: 'number',
  Float: 'number',
  Long: 'number',
  DateTime: 'string',
  Date: 'string',
}

/** 固定泛型类型默认名 */
export const DEFAULT_GENERIC_NAMES = {
  businessResponse: 'CommonBusinessResponse',
  page: 'Page',
}

/**
 * 生成器保留名。
 * 设计文档 7.5.4 明确列出 CommonBusinessResponse / Page / ApiOptions / Executor / createApi；
 * 其余名称来自生成物 executor.ts 的导出符号，Schema 同名类型同样会导致生成物类型冲突，因此一并保留。
 */
export const RESERVED_RUNTIME_NAMES = [
  'ApiOptions',
  'ExecuteOptions',
  'Executor',
  'GraphQLRequestError',
  'GraphQLResponse',
  'GraphQLErrorItem',
  'GraphQLErrorLocation',
  'GraphQLErrorExtensions',
  'createExecutor',
  'createApi',
]

const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/

/**
 * 加载配置文件并完成校验与默认值合并。
 *
 * @param {string} configPath 配置文件路径，相对当前工作目录
 * @returns {Promise<object>} 规范化配置对象
 */
export async function loadConfig(configPath) {
  const absoluteConfigPath = resolve(configPath)
  if (!existsSync(absoluteConfigPath) || !statSync(absoluteConfigPath).isFile()) {
    throw new CodegenError('E001', `配置文件不存在: ${absoluteConfigPath}`)
  }

  const configDir = dirname(absoluteConfigPath)
  let imported
  try {
    // 追加时间戳查询参数，避免同一进程内多次加载同一路径时命中模块缓存（测试场景会重复加载）
    imported = await import(`${pathToFileURL(absoluteConfigPath).href}?t=${Date.now()}`)
  } catch (error) {
    throw new CodegenError('E002', `配置文件加载失败: ${absoluteConfigPath}`, [error.message])
  }

  const raw = imported.default
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CodegenError('E002', `配置文件必须默认导出对象: ${absoluteConfigPath}`)
  }

  const schemaDir = resolveConfigPath(raw.schemaDir, 'schemaDir', configDir)
  if (!existsSync(schemaDir) || !statSync(schemaDir).isDirectory()) {
    throw new CodegenError('E002', `schemaDir 不是合法目录: ${schemaDir}`)
  }

  const outputDir = resolveConfigPath(raw.outputDir, 'outputDir', configDir)
  if (outputDir === schemaDir) {
    throw new CodegenError('E002', `outputDir 不能与 schemaDir 相同: ${outputDir}`)
  }

  const endpoint = raw.endpoint ?? DEFAULT_ENDPOINT
  if (typeof endpoint !== 'string' || !endpoint.startsWith('/')) {
    throw new CodegenError('E002', `endpoint 必须以 / 开头: ${String(endpoint)}`)
  }

  const genericNames = mergeGenericNames(raw.genericNames, absoluteConfigPath)
  const scalars = mergeScalars(raw.scalars, absoluteConfigPath)
  const header = mergeHeader(raw.header, absoluteConfigPath)

  const reservedTypeNames = new Set([
    ...RESERVED_RUNTIME_NAMES,
    genericNames.businessResponse,
    genericNames.page,
  ])

  return {
    configPath: absoluteConfigPath,
    configDir,
    schemaDir,
    outputDir,
    endpoint,
    genericNames,
    scalars,
    header,
    reservedTypeNames,
  }
}

/**
 * 校验并解析必填路径配置项。
 *
 * @param {unknown} value 配置值
 * @param {string} key 配置项名，用于错误信息
 * @param {string} configDir 配置文件所在目录
 * @returns {string} 绝对路径
 */
function resolveConfigPath(value, key, configDir) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CodegenError('E002', `配置项 ${key} 为必填且必须是非空字符串`)
  }
  return resolve(configDir, value)
}

/**
 * 合并并校验泛型类型名。
 *
 * @param {unknown} value 用户配置
 * @param {string} configPath 配置文件路径，用于错误信息
 * @returns {{businessResponse: string, page: string}}
 */
function mergeGenericNames(value, configPath) {
  if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    throw new CodegenError('E002', `genericNames 必须是对象: ${configPath}`)
  }
  const merged = { ...DEFAULT_GENERIC_NAMES, ...(value ?? {}) }
  for (const [key, name] of Object.entries(merged)) {
    if (typeof name !== 'string' || !IDENTIFIER_PATTERN.test(name)) {
      throw new CodegenError('E002', `genericNames.${key} 必须是合法的 TypeScript 标识符: ${String(name)}`)
    }
  }
  return merged
}

/**
 * 合并并校验标量映射。
 *
 * @param {unknown} value 用户配置
 * @param {string} configPath 配置文件路径，用于错误信息
 * @returns {Record<string, string>}
 */
function mergeScalars(value, configPath) {
  if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    throw new CodegenError('E002', `scalars 必须是对象: ${configPath}`)
  }
  const merged = { ...DEFAULT_SCALARS, ...(value ?? {}) }
  for (const [scalar, tsType] of Object.entries(merged)) {
    if (typeof tsType !== 'string' || tsType.trim() === '') {
      throw new CodegenError('E002', `scalars.${scalar} 必须是非空字符串`)
    }
  }
  return merged
}

/**
 * 校验文件头配置。
 *
 * @param {unknown} value 用户配置
 * @param {string} configPath 配置文件路径，用于错误信息
 * @returns {string[]}
 */
function mergeHeader(value, configPath) {
  if (value === undefined) {
    return [...DEFAULT_HEADER]
  }
  if (!Array.isArray(value) || value.some((line) => typeof line !== 'string')) {
    throw new CodegenError('E002', `header 必须是字符串数组: ${configPath}`)
  }
  return [...value]
}
