/**
 * 测试：生成物的 TypeScript 类型检查。
 *
 * 输入：src/api/generated 下全部生成文件 + test/type/api-type-assertions.ts。
 * 输出：tsc 诊断为空即通过；`@ts-expect-error` 未生效会以 TS2578 失败。
 * 关键约束：编译选项与前端工程保持一致（strict + noUncheckedIndexedAccess + verbatimModuleSyntax）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const GENERATED_DIR = join(HERE, '../../../../src/api/generated')
const ASSERTIONS_FILE = join(HERE, 'api-type-assertions.ts')

/**
 * 递归收集 TypeScript 源文件。
 *
 * @param {string} directory 目录
 * @returns {string[]} 文件绝对路径
 */
function collectTypeScriptFiles(directory) {
  const result = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectTypeScriptFiles(absolutePath))
    } else if (entry.name.endsWith('.ts')) {
      result.push(absolutePath)
    }
  }
  return result
}

test('类型检查：生成物与类型断言在 strict 模式下 0 error', () => {
  const rootNames = [ASSERTIONS_FILE, ...collectTypeScriptFiles(GENERATED_DIR)]
  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    verbatimModuleSyntax: true,
    noUncheckedIndexedAccess: true,
    forceConsistentCasingInFileNames: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: [],
  }

  const program = ts.createProgram(rootNames, options)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  const messages = diagnostics.map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    if (diagnostic.file && diagnostic.start !== undefined) {
      const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`
    }
    return message
  })

  assert.deepEqual(messages, [])
})
