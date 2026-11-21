/**
 * 测试：配置加载与校验。
 *
 * 覆盖设计文档 7.1 的必填项、默认值、路径解析与 E001 / E002 错误分支。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { loadConfig, DEFAULT_HEADER } from '../../src/config.mjs'
import { assertCodegenError, createTempDir, removeDir, writeConfig, writeFiles } from '../helpers.mjs'

/**
 * 创建带基础 SDL 的临时工程。
 *
 * @param {import('node:test').TestContext} t 测试上下文
 * @param {object} [overrides] 配置覆盖项
 * @returns {Promise<{tempDir: string, configPath: string}>}
 */
async function setupProject(t, overrides = {}) {
  const tempDir = createTempDir()
  t.after(() => removeDir(tempDir))

  const schemaDir = join(tempDir, 'sdl')
  writeFiles(schemaDir, {
    'Base.graphql': 'type Query\nextend type Query { ping: String }\n',
  })

  const configPath = writeConfig(tempDir, {
    schemaDir,
    outputDir: join(tempDir, 'generated'),
    ...overrides,
  })
  return { tempDir, configPath }
}

test('配置加载：补齐 endpoint / 泛型名 / 标量 / 文件头默认值', async (t) => {
  const { configPath } = await setupProject(t)
  const config = await loadConfig(configPath)

  assert.equal(config.endpoint, '/graphql')
  assert.deepEqual(config.genericNames, {
    businessResponse: 'CommonBusinessResponse',
    page: 'Page',
  })
  assert.equal(config.scalars.Long, 'number')
  assert.equal(config.scalars.DateTime, 'string')
  assert.equal(config.scalars.String, 'string')
  assert.equal(config.scalars.Boolean, 'boolean')
  assert.deepEqual(config.header, DEFAULT_HEADER)
  assert.ok(config.reservedTypeNames.has('Page'))
  assert.ok(config.reservedTypeNames.has('CommonBusinessResponse'))
  assert.ok(config.reservedTypeNames.has('createApi'))
})

test('配置加载：相对路径以配置文件所在目录解析', async (t) => {
  const { tempDir, configPath } = await setupProject(t)
  const config = await loadConfig(configPath)

  assert.equal(config.schemaDir, join(tempDir, 'sdl'))
  assert.equal(config.outputDir, join(tempDir, 'generated'))
})

test('配置加载：用户配置覆盖默认值', async (t) => {
  const { configPath } = await setupProject(t, {
    endpoint: '/api/graphql',
    genericNames: { businessResponse: 'BizResponse', page: 'Paged' },
    scalars: { Long: 'string' },
    header: ['// custom'],
  })
  const config = await loadConfig(configPath)

  assert.equal(config.endpoint, '/api/graphql')
  assert.equal(config.genericNames.businessResponse, 'BizResponse')
  assert.equal(config.genericNames.page, 'Paged')
  assert.equal(config.scalars.Long, 'string')
  assert.equal(config.scalars.DateTime, 'string')
  assert.deepEqual(config.header, ['// custom'])
  assert.ok(config.reservedTypeNames.has('Paged'))
})

test('配置加载：配置文件不存在时抛 E001', async (t) => {
  const tempDir = createTempDir()
  t.after(() => removeDir(tempDir))

  await assert.rejects(
    loadConfig(join(tempDir, 'missing.config.mjs')),
    (error) => {
      assertCodegenError(error, 'E001')
      return true
    },
  )
})

test('配置加载：缺少 outputDir 时抛 E002', async (t) => {
  const tempDir = createTempDir()
  t.after(() => removeDir(tempDir))
  const schemaDir = join(tempDir, 'sdl')
  writeFiles(schemaDir, { 'Base.graphql': 'type Query\n' })
  const configPath = writeConfig(tempDir, { schemaDir })

  await assert.rejects(loadConfig(configPath), (error) => {
    assertCodegenError(error, 'E002')
    assert.match(error.message, /outputDir/)
    return true
  })
})

test('配置加载：schemaDir 不存在时抛 E002 并输出绝对路径', async (t) => {
  const tempDir = createTempDir()
  t.after(() => removeDir(tempDir))
  const configPath = writeConfig(tempDir, {
    schemaDir: join(tempDir, 'missing-sdl'),
    outputDir: join(tempDir, 'generated'),
  })

  await assert.rejects(loadConfig(configPath), (error) => {
    assertCodegenError(error, 'E002')
    assert.match(error.message, /missing-sdl/)
    return true
  })
})

test('配置加载：endpoint 不以 / 开头时抛 E002', async (t) => {
  const { configPath } = await setupProject(t, { endpoint: 'graphql' })

  await assert.rejects(loadConfig(configPath), (error) => {
    assertCodegenError(error, 'E002')
    return true
  })
})

test('配置加载：泛型名不是合法标识符时抛 E002', async (t) => {
  const { configPath } = await setupProject(t, {
    genericNames: { page: 'Page-T' },
  })

  await assert.rejects(loadConfig(configPath), (error) => {
    assertCodegenError(error, 'E002')
    assert.match(error.message, /genericNames\.page/)
    return true
  })
})

test('配置加载：header 含非字符串项时抛 E002', async (t) => {
  const { configPath } = await setupProject(t, { header: ['ok', 42] })

  await assert.rejects(loadConfig(configPath), (error) => {
    assertCodegenError(error, 'E002')
    return true
  })
})
