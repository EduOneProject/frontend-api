/**
 * 模块职责：读取 SDL 目录并逐个文件解析为 GraphQL AST。
 *
 * 输入：schemaDir 绝对路径。
 * 输出：按文件名升序排列的 `{ fileName, baseName, source, document }` 列表。
 * 关键约束：
 *   - 必须按文件名升序读取，保证生成结果确定；
 *   - 必须使用 graphql.parse，禁止用正则提取结构；
 *   - 解析失败必须以 E003 输出文件名、行号、列号。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'graphql'
import { CodegenError } from './errors.mjs'

/**
 * 加载 SDL 目录下的全部 .graphql 文件。
 *
 * @param {string} schemaDir 后端 SDL 目录
 * @returns {Array<{fileName: string, baseName: string, source: string, document: import('graphql').DocumentNode}>}
 */
export function loadSdlFiles(schemaDir) {
  const fileNames = readdirSync(schemaDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.graphql'))
    .map((entry) => entry.name)
    // 默认字符串排序（按 UTF-16 码元），保证同一目录在不同平台输出一致
    .sort()

  if (fileNames.length === 0) {
    throw new CodegenError('E002', `SDL 目录中没有 .graphql 文件: ${schemaDir}`)
  }

  return fileNames.map((fileName) => {
    const absolutePath = join(schemaDir, fileName)
    const source = readFileSync(absolutePath, 'utf8')
    let document
    try {
      document = parse(source)
    } catch (error) {
      // GraphQL.parse 抛出的语法错误携带 locations，用于定位到具体行列
      const location = error.locations?.[0]
      const details = location ? [`行 ${location.line}，列 ${location.column}`] : []
      throw new CodegenError('E003', `SDL 解析失败: ${fileName}`, [error.message, ...details])
    }
    return {
      fileName,
      baseName: fileName.replace(/\.graphql$/, ''),
      source,
      document,
    }
  })
}
