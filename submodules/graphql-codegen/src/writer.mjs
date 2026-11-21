/**
 * 模块职责：产物目录的写入与差异校验。
 *
 * 输入：输出目录绝对路径、`Map<相对路径, 文件内容>`。
 * 输出：写盘结果；`--check` 模式下返回差异列表。
 * 关键约束：
 *   - 写盘前必须先清空输出目录，避免残留过期文件；
 *   - 所有内容在内存中生成完毕后才允许写盘，失败时不得留下半成品；
 *   - 比较必须逐文件逐字节进行，路径统一使用 `/` 分隔。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { CodegenError } from './errors.mjs'

/**
 * 全量写入产物：先清空输出目录，再按路径排序写入。
 *
 * @param {string} outputDir 输出目录绝对路径
 * @param {Map<string, string>} files 相对路径 → 文件内容
 */
export function writeArtifacts(outputDir, files) {
  try {
    rmSync(outputDir, { recursive: true, force: true })
    for (const relativePath of [...files.keys()].sort()) {
      const absolutePath = join(outputDir, relativePath)
      mkdirSync(dirname(absolutePath), { recursive: true })
      writeFileSync(absolutePath, files.get(relativePath), 'utf8')
    }
  } catch (error) {
    throw new CodegenError('E011', `产物写入失败: ${outputDir}`, [error.message])
  }
}

/**
 * 比较内存产物与磁盘现有产物。
 *
 * @param {string} outputDir 输出目录绝对路径
 * @param {Map<string, string>} files 期望的产物
 * @returns {string[]} 差异描述列表，空数组表示完全一致
 */
export function diffArtifacts(outputDir, files) {
  const existingFiles = listFiles(outputDir)
  const existingSet = new Set(existingFiles)
  const differences = []

  for (const relativePath of [...files.keys()].sort()) {
    if (!existingSet.has(relativePath)) {
      differences.push(`缺失: ${relativePath}`)
      continue
    }
    const actual = readFileSync(join(outputDir, relativePath), 'utf8')
    if (actual !== files.get(relativePath)) {
      differences.push(`内容不一致: ${relativePath}`)
    }
    existingSet.delete(relativePath)
  }

  for (const extra of [...existingSet].sort()) {
    differences.push(`多余: ${extra}`)
  }

  return differences
}

/**
 * 递归列出目录下所有文件，返回相对路径（统一 `/` 分隔）。
 *
 * @param {string} root 根目录
 * @returns {string[]} 相对路径列表
 */
function listFiles(root) {
  if (!existsSync(root)) {
    return []
  }

  const result = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolutePath)
      } else {
        result.push(relative(root, absolutePath).split(sep).join('/'))
      }
    }
  }

  walk(root)
  return result.sort()
}
