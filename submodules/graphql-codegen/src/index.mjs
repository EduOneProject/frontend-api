#!/usr/bin/env node
/**
 * 模块职责：graphql-codegen CLI 入口与生成流程编排。
 *
 * 输入：`--config <路径>` 指定配置文件，`--check` 只比较不写盘。
 * 输出：
 *   - 默认模式：清空并重写 outputDir 下的全部产物；
 *   - `--check` 模式：产物与 SDL 不一致时输出差异并以退出码 1 结束。
 * 关键约束：
 *   - 所有内容在内存中生成并通过 Operation 校验后才允许写盘；
 *   - 所有错误写入 stderr，并携带设计文档第 9 章错误码。
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CodegenError } from './errors.mjs'
import { loadConfig } from './config.mjs'
import { loadSdlFiles } from './sdl-loader.mjs'
import { analyzeSdl } from './analyzer.mjs'
import { buildCompletedSchema, validateOperationDocuments } from './schema.mjs'
import { emitOperations } from './emitters/operations.mjs'
import { emitTypes } from './emitters/types.mjs'
import { emitMethods } from './emitters/methods.mjs'
import { emitClient } from './emitters/client.mjs'
import { diffArtifacts, writeArtifacts } from './writer.mjs'

/**
 * 执行一次完整生成流程。
 *
 * @param {{configPath: string, check?: boolean, logger?: (message: string) => void}} options 运行参数
 * @returns {Promise<{config: object, files: Map<string, string>, operations: object[], schema: object}>} 生成结果
 */
export async function runCodegen({ configPath, check = false, logger = () => {} }) {
  const config = await loadConfig(configPath)
  logger(`配置: ${config.configPath}`)

  const sdlFiles = loadSdlFiles(config.schemaDir)
  logger(`SDL: ${sdlFiles.length} 个文件（${sdlFiles.map((file) => file.fileName).join(', ')}）`)

  const analysis = analyzeSdl(sdlFiles, config)
  logger(`根字段: ${analysis.rootFields.length} 个，类型: ${analysis.typeDefs.size} 个`)

  const { files: operationFiles, operations } = emitOperations(analysis)

  // 先构建补全后的 Schema 并校验所有 Operation，校验失败时不会产生任何文件
  const schema = buildCompletedSchema(analysis, config)
  validateOperationDocuments(schema, operations)

  const typeFiles = emitTypes({ typeDefs: analysis.typeDefs, config })
  const { files: methodFiles, factories } = emitMethods({
    rootFields: analysis.rootFields,
    typeDefs: analysis.typeDefs,
    operations,
    fqcnToTypeName: analysis.fqcnToTypeName,
    config,
  })
  const clientFiles = emitClient({ factories, config })

  const files = new Map()
  for (const collection of [operationFiles, typeFiles, methodFiles, clientFiles]) {
    for (const [relativePath, content] of collection) {
      if (files.has(relativePath)) {
        throw new CodegenError('E009', `产物路径重复: ${relativePath}`)
      }
      files.set(relativePath, content)
    }
  }

  if (check) {
    const differences = diffArtifacts(config.outputDir, files)
    if (differences.length > 0) {
      throw new CodegenError('E012', `生成物与 SDL 不一致: ${config.outputDir}`, differences)
    }
  } else {
    writeArtifacts(config.outputDir, files)
  }

  return { config, files, operations, schema }
}

/**
 * 解析 CLI 参数。
 *
 * @param {string[]} argv 不含 node 与脚本路径的参数
 * @returns {{configPath: string, check: boolean}}
 */
export function parseArguments(argv) {
  let configPath = 'graphql-codegen.config.mjs'
  let check = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') {
      check = true
      continue
    }
    if (argument === '--config') {
      const value = argv[index + 1]
      if (!value) {
        throw new CodegenError('E002', '--config 缺少参数值')
      }
      configPath = value
      index += 1
      continue
    }
    if (argument.startsWith('--config=')) {
      configPath = argument.slice('--config='.length)
      continue
    }
    throw new CodegenError('E002', `未知的 CLI 参数: ${argument}`)
  }

  return { configPath, check }
}

/**
 * CLI 主流程。
 *
 * @returns {Promise<void>}
 */
async function main() {
  try {
    const options = parseArguments(process.argv.slice(2))
    const result = await runCodegen({
      configPath: options.configPath,
      check: options.check,
      logger: (message) => console.log(`[graphql-codegen] ${message}`),
    })

    if (options.check) {
      console.log(`[graphql-codegen] 生成物与 SDL 一致（${result.files.size} 个文件）`)
    } else {
      console.log(`[graphql-codegen] 已生成 ${result.files.size} 个文件 → ${result.config.outputDir}`)
    }
  } catch (error) {
    if (error instanceof CodegenError) {
      console.error(error.format())
    } else {
      console.error(`[graphql-codegen] 未处理异常: ${error.stack ?? error.message}`)
    }
    process.exitCode = 1
  }
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (entryPath && import.meta.url === entryPath) {
  await main()
}
