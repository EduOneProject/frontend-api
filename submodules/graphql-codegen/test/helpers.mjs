/**
 * 模块职责：测试公共工具。
 *
 * 提供临时目录、临时配置文件、SDL 夹具写入与错误断言辅助，避免各测试重复实现 I/O 细节。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

/**
 * 创建临时目录。
 *
 * @param {string} [prefix] 目录名前缀
 * @returns {string} 绝对路径
 */
export function createTempDir(prefix = 'graphql-codegen-test-') {
  return mkdtempSync(join(tmpdir(), prefix))
}

/**
 * 递归删除临时目录。
 *
 * @param {string} dir 目录路径
 */
export function removeDir(dir) {
  rmSync(dir, { recursive: true, force: true })
}

/**
 * 按相对路径写入一批文本文件（自动创建父目录）。
 *
 * @param {string} root 根目录
 * @param {Record<string, string>} files 相对路径 → 内容
 */
export function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, content, 'utf8')
  }
}

/**
 * 在目录下写入 graphql-codegen.config.mjs。
 *
 * @param {string} dir 配置文件所在目录
 * @param {object} config 配置对象
 * @returns {string} 配置文件绝对路径
 */
export function writeConfig(dir, config) {
  const configPath = join(dir, 'graphql-codegen.config.mjs')
  writeFileSync(configPath, `export default ${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return configPath
}

/**
 * 断言错误为指定错误码的 CodegenError。
 *
 * @param {unknown} error 捕获到的错误
 * @param {string} code 期望错误码
 */
export function assertCodegenError(error, code) {
  assert.equal(error?.name, 'CodegenError', `期望 CodegenError，实际为 ${error?.name}: ${error?.message}`)
  assert.equal(error.code, code)
}
