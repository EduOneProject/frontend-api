/**
 * Golden Test：固定 SDL 输入的完整产物快照。
 *
 * 输入：test/fixtures/sdl 下的固定 SDL。
 * 输出：与 test/golden/expected-output.json 快照逐字节比较。
 * 关键约束：
 *   - 快照必须提交到仓库，任何生成逻辑变更都应产生可审阅 diff；
 *   - 需要更新快照时以 UPDATE_GOLDEN=1 运行本测试，并人工审查差异。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCodegen } from '../../src/index.mjs'
import { assertCodegenError, createTempDir, removeDir, writeConfig } from '../helpers.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const FIXTURE_SDL_DIR = join(HERE, '../fixtures/sdl')
const SNAPSHOT_PATH = join(HERE, 'expected-output.json')

/**
 * 生成固定夹具的产物。
 *
 * @param {import('node:test').TestContext} t 测试上下文
 * @returns {Promise<{tempDir: string, configPath: string, outputDir: string, files: Map<string, string>}>}
 */
async function generateFixture(t) {
  const tempDir = createTempDir()
  t.after(() => removeDir(tempDir))

  const outputDir = join(tempDir, 'generated')
  const configPath = writeConfig(tempDir, {
    schemaDir: FIXTURE_SDL_DIR,
    outputDir,
  })
  const { files } = await runCodegen({ configPath })
  return { tempDir, configPath, outputDir, files }
}

test('Golden：完整产物与快照逐文件一致', async (t) => {
  const { files } = await generateFixture(t)
  const actual = Object.fromEntries([...files.entries()].sort())

  if (process.env.UPDATE_GOLDEN === '1') {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(actual, null, 2)}\n`, 'utf8')
  }

  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
  assert.deepEqual(actual, expected)
})

test('Golden：@see 的简单名、FQCN 命中、FQCN 未命中与已有 {@link} 均符合规则', async (t) => {
  const { files } = await generateFixture(t)
  const methodFile = files.get('methods/SampleQueryResolver.ts')

  assert.ok(methodFile.includes('     * @see {@link SampleResponse}'))
  assert.ok(methodFile.includes('     * @see io.example.UnknownThing'))
  assert.ok(methodFile.includes('     * @see UnknownThing'))
  assert.ok(methodFile.includes('     * @see 参见 {@link SampleStatus}'))

  // FQCN 命中与简单名命中必须完全一致，且不允许出现只替换类名部分的错误输出
  assert.ok(!methodFile.includes('io.example.{@link SampleResponse}'))
  assert.ok(!methodFile.includes('io.example.UnknownThing{@link'))
})

test('Golden：方法签名遵循参数默认值规则并引用泛型包装', async (t) => {
  const { files } = await generateFixture(t)

  const queryMethod = files.get('methods/SampleQueryResolver.ts')
  assert.ok(queryMethod.includes('async listSample(request: SampleRequest = {}): Promise<Array<SampleResponse | null> | null>'))
  assert.ok(queryMethod.includes('async pageSample(page: PageRequest = {}): Promise<Page<SampleResponse> | null>'))
  assert.ok(queryMethod.includes('async requireFlag(): Promise<boolean | null>'))

  const mutationMethod = files.get('methods/SampleMutationResolver.ts')
  assert.ok(mutationMethod.includes('async createSample(request: CreateSampleRequest): Promise<CommonBusinessResponse<boolean> | null>'))
  assert.ok(mutationMethod.includes("method: 'createSample'"))
})

test('Golden：Operation 覆盖标量根字段、包装根字段与必填参数', async (t) => {
  const { files } = await generateFixture(t)

  assert.equal(
    files.get('operations/SampleQueryResolver.Query.requireFlag.graphql'),
    'query requireFlag {\n  requireFlag\n}\n',
  )

  const pageOperation = files.get('operations/SampleQueryResolver.Query.pageSample.graphql')
  assert.ok(pageOperation.startsWith('query pageSample($page: PageRequest) {'))
  assert.ok(pageOperation.includes('    currentPageData {'))
  assert.ok(pageOperation.includes('    totalSize\n    pageNo\n    pageSize'))

  const createOperation = files.get('operations/SampleMutationResolver.Mutation.createSample.graphql')
  assert.ok(createOperation.startsWith('mutation createSample($request: CreateSampleRequest!) {'))
  assert.ok(createOperation.includes('    code\n    message'))
})

test('Golden：产物中不存在运行时内部包装类型', async (t) => {
  const { files } = await generateFixture(t)

  for (const [path, content] of files) {
    assert.ok(!content.includes('BooleanBusinessResponse'), `${path} 不应包含 BooleanBusinessResponse`)
    assert.ok(!content.includes('SampleResponseDataPage'), `${path} 不应包含 SampleResponseDataPage`)
  }
})

test('Golden：--check 在产物一致时通过、在出现差异时报 E012', async (t) => {
  const { configPath, outputDir, files } = await generateFixture(t)

  await runCodegen({ configPath, check: true })

  // 人为制造残留文件，模拟 SDL 变更后未重新生成
  writeFileSync(join(outputDir, 'operations/Stale.graphql'), 'query stale { stale }\n', 'utf8')

  await assert.rejects(runCodegen({ configPath, check: true }), (error) => {
    assertCodegenError(error, 'E012')
    assert.ok(error.details.some((detail) => detail.includes('operations/Stale.graphql')))
    return true
  })

  assert.ok(files.size > 0)
})
