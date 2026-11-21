/**
 * 集成测试：基于后端真实 SDL 的全量生成验证。
 *
 * 输入：backend/eduone-web/src/main/resources/graphql 下的真实 SDL。
 * 输出：文件集合、Operation 校验、导入方式、注释与确定性断言。
 * 关键约束：
 *   - 测试使用临时输出目录，不修改仓库内受版本管理的生成物；
 *   - 仓库内生成物的一致性由 codegen:check 语义单独验证。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validate } from 'graphql'
import { runCodegen } from '../../src/index.mjs'
import { assertCodegenError, createTempDir, removeDir, writeConfig } from '../helpers.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REAL_CONFIG_PATH = join(HERE, '../../../../graphql-codegen.config.mjs')

/** 设计文档 17.2 约定的 Operation 文件清单 */
const EXPECTED_OPERATIONS = [
  'operations/AuthMutationResolver.Mutation.logout.graphql',
  'operations/AuthMutationResolver.Mutation.rotateAccessToken.graphql',
  'operations/BusinessDictionaryQueryResolver.Query.listBusinessDictionary.graphql',
  'operations/BusinessDictionaryQueryResolver.Query.listBusinessDictionaryType.graphql',
  'operations/BusinessDictionaryQueryResolver.Query.pageBusinessDictionary.graphql',
  'operations/BusinessDictionaryQueryResolver.Query.pageBusinessDictionaryType.graphql',
  'operations/RegionTreeQueryResolver.Query.listRegionTree.graphql',
  'operations/UserLoginMutationResolver.Mutation.loginWithPassword.graphql',
  'operations/ValidationMutationResolver.Mutation.applyImageCaptcha.graphql',
  'operations/ValidationMutationResolver.Mutation.validateImageCaptcha.graphql',
  'operations/ValidationMutationResolver.Query.requireVerificationContext.graphql',
]

/** 设计文档 7.11 约定的方法文件清单 */
const EXPECTED_METHODS = [
  'methods/AuthMutationResolver.ts',
  'methods/BusinessDictionaryQueryResolver.ts',
  'methods/RegionTreeQueryResolver.ts',
  'methods/UserLoginMutationResolver.ts',
  'methods/ValidationMutationResolver.ts',
]

/**
 * 使用真实 SDL 生成到临时目录。
 *
 * @param {import('node:test').TestContext} t 测试上下文
 * @returns {Promise<object>} runCodegen 结果
 */
async function generateRealSdl(t) {
  const tempDir = createTempDir()
  t.after(() => removeDir(tempDir))

  const outputDir = join(tempDir, 'generated')
  const configPath = writeConfig(tempDir, {
    // schemaDir 使用绝对路径，避免依赖临时配置与仓库的相对位置
    schemaDir: readRealSchemaDir(),
    outputDir,
  })

  return runCodegen({ configPath })
}

/**
 * 从真实配置文件中解析 schemaDir 的绝对路径。
 *
 * @returns {string} SDL 目录绝对路径
 */
function readRealSchemaDir() {
  const configSource = readFileSync(REAL_CONFIG_PATH, 'utf8')
  const match = /schemaDir:\s*'([^']+)'/.exec(configSource)
  assert.ok(match, '真实配置必须包含 schemaDir')
  return join(HERE, '../../../../', match[1])
}

test('真实 SDL：产物文件集合与设计文档完全一致', async (t) => {
  const { files } = await generateRealSdl(t)

  const expected = [
    'executor.ts',
    'client.ts',
    'index.ts',
    'raw.d.ts',
    'types/index.ts',
    'types/enums/index.ts',
    'types/inputs/index.ts',
    'types/outputs/index.ts',
    ...EXPECTED_METHODS,
    ...EXPECTED_OPERATIONS,
  ].sort()

  assert.deepEqual([...files.keys()].sort(), expected)
})

test('真实 SDL：11 个 Operation 全部通过 graphql.validate', async (t) => {
  const { operations, schema } = await generateRealSdl(t)

  assert.equal(operations.length, EXPECTED_OPERATIONS.length)
  for (const operation of operations) {
    assert.deepEqual(validate(schema, operation.document), [], `Operation ${operation.field.name} 校验失败`)
  }
})

test('真实 SDL：方法文件仅通过 ?raw 导入 GraphQL，且每次请求携带根字段名', async (t) => {
  const { files, operations } = await generateRealSdl(t)

  for (const methodPath of EXPECTED_METHODS) {
    const content = files.get(methodPath)
    assert.ok(content.includes("?raw'"), `${methodPath} 必须通过 ?raw 导入 Operation`)
    assert.ok(content.includes('const data = await execute<Record<string,'), `${methodPath} 必须通过 execute 执行`)
    assert.doesNotMatch(content, /^(query|mutation)\s+[A-Za-z_]/m, `${methodPath} 不得内联 GraphQL`)

    for (const operation of operations) {
      if (operation.field.sourceBaseName === methodPath.replace('methods/', '').replace('.ts', '')) {
        assert.ok(
          content.includes(`method: '${operation.field.name}'`),
          `${methodPath} 必须为 ${operation.field.name} 传入 method`,
        )
        assert.ok(
          content.includes(`../operations/${operation.fileName}?raw`),
          `${methodPath} 必须导入 ${operation.fileName}`,
        )
      }
    }
  }
})

test('真实 SDL：产物中不存在运行时内部包装类型', async (t) => {
  const { files } = await generateRealSdl(t)

  for (const [path, content] of files) {
    assert.ok(!content.includes('BooleanBusinessResponse'), `${path} 不应包含 BooleanBusinessResponse`)
    assert.ok(!content.includes('ResponseDataPage'), `${path} 不应包含 *DataPage 运行时类型`)
  }
})

test('真实 SDL：CommonBusinessResponse<T> 与 Page<T> 注释与 Java 来源一致', async (t) => {
  const { files } = await generateRealSdl(t)
  const outputs = files.get('types/outputs/index.ts')

  assert.ok(outputs.includes([
    '/**',
    ' * 通用业务响应体',
    ' */',
    'export interface CommonBusinessResponse<T> {',
  ].join('\n')))
  assert.ok(outputs.includes([
    '  /**',
    '   * 响应码',
    '   */',
    '  code: string | null',
    '  /**',
    '   * 响应消息',
    '   */',
    '  message: string | null',
    '  /**',
    '   * 响应数据',
    '   */',
    '  data: T | null',
  ].join('\n')))

  assert.ok(outputs.includes([
    '/**',
    ' * 分页信息',
    ' */',
    'export interface Page<T> {',
  ].join('\n')))
  assert.ok(outputs.includes([
    '  /**',
    '   * 当前页',
    '   */',
    '  pageNo: number | null',
    '  /**',
    '   * 每页数据数量',
    '   */',
    '  pageSize: number | null',
    '  /**',
    '   * 当前页数据信息',
    '   */',
    '  currentPageData: Array<T | null> | null',
    '  /**',
    '   * 总数量',
    '   */',
    '  totalSize: number | null',
  ].join('\n')))
})

test('真实 SDL：方法签名与 SDL 参数顺序、名称一致', async (t) => {
  const { files } = await generateRealSdl(t)

  const dictionaryMethods = files.get('methods/BusinessDictionaryQueryResolver.ts')
  const pageMethodStart = dictionaryMethods.indexOf('async pageBusinessDictionary(')
  const pageMethod = dictionaryMethods.slice(pageMethodStart)
  const pageIndex = pageMethod.indexOf('page: PageRequest = {}')
  const requestIndex = pageMethod.indexOf('request: BusinessDictionaryRequest = {}')
  const sortListIndex = pageMethod.indexOf('sortList: Array<BusinessDictionarySortRequest | null> | null = null')
  assert.ok(pageIndex > 0 && requestIndex > pageIndex && sortListIndex > requestIndex)

  const authMethods = files.get('methods/AuthMutationResolver.ts')
  assert.ok(authMethods.includes('async logout(): Promise<CommonBusinessResponse<boolean> | null>'))
  assert.ok(authMethods.includes('async rotateAccessToken(refreshToken: string | null = null): Promise<CommonBusinessResponse<RotateAccessTokenResponse> | null>'))

  const regionMethods = files.get('methods/RegionTreeQueryResolver.ts')
  assert.ok(regionMethods.includes('async listRegionTree(request: RegionTreeQueryRequest = {}): Promise<Array<RegionTreeResponse | null> | null>'))
})

test('真实 SDL：生成结果确定，两次运行逐字节一致', async (t) => {
  const first = await generateRealSdl(t)
  const second = await generateRealSdl(t)

  assert.deepEqual(Object.fromEntries([...first.files].sort()), Object.fromEntries([...second.files].sort()))
})

test('真实 SDL：仓库内生成物与 SDL 保持同步', async () => {
  await runCodegen({ configPath: REAL_CONFIG_PATH, check: true })
})

test('真实 SDL：--check 能发现残留文件并报 E012', async (t) => {
  const tempDir = createTempDir()
  t.after(() => removeDir(tempDir))

  const outputDir = join(tempDir, 'generated')
  const configPath = writeConfig(tempDir, {
    schemaDir: readRealSchemaDir(),
    outputDir,
  })

  await runCodegen({ configPath })
  await runCodegen({ configPath, check: true })

  // 注入残留文件，模拟 SDL 变更后未重新生成的场景
  writeFileSync(join(outputDir, 'operations/Stale.graphql'), 'query stale { stale }\n', 'utf8')

  await assert.rejects(runCodegen({ configPath, check: true }), (error) => {
    assertCodegenError(error, 'E012')
    assert.ok(error.details.some((detail) => detail.includes('operations/Stale.graphql')))
    return true
  })
})
