/**
 * 测试：SDL 分析、包装类型合成、Operation 生成与校验。
 *
 * 覆盖设计文档 7.2 - 7.9 的 AST 分析模型、指令语义、命名规则与 E004 - E009 错误分支。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { parse, validate } from 'graphql'
import { loadConfig } from '../../src/config.mjs'
import { loadSdlFiles } from '../../src/sdl-loader.mjs'
import { analyzeSdl } from '../../src/analyzer.mjs'
import { buildCompletedSchema, validateOperationDocuments } from '../../src/schema.mjs'
import { buildOperationFileName, emitOperations } from '../../src/emitters/operations.mjs'
import { assertCodegenError, createTempDir, removeDir, writeConfig, writeFiles } from '../helpers.mjs'

const BASE_SDL = `type Query
type Mutation
directive @commonBusinessResponse(for: String!) on FIELD_DEFINITION
directive @page(for: String!) on FIELD_DEFINITION
directive @type(value: String!) on OBJECT | INPUT_OBJECT | ENUM
scalar Boolean
scalar Long
scalar String

"""示例响应"""
type SampleResponse @type(value: "io.example.SampleResponse") {
    """主键"""
    id: String!
}

"""示例状态"""
enum SampleStatus @type(value: "io.example.SampleStatus") {
    """启用"""
    ENABLED
}

"""示例查询条件"""
input SampleRequest @type(value: "io.example.SampleRequest") {
    """关键字"""
    keyword: String
}
`

const QUERY_SDL = `extend type Query {
    """
    查询示例

    @param request 查询条件
    @return 示例列表
    """
    listSample(request: SampleRequest): [SampleResponse]
    """
    分页查询示例
    """
    pageSample(page: SampleRequest): SampleResponseDataPage @page(for: "SampleResponse")
}
`

const MUTATION_SDL = `extend type Mutation {
    """
    创建示例
    """
    createSample(request: SampleRequest): BooleanBusinessResponse @commonBusinessResponse(for: "Boolean")
}
`

/**
 * 写入临时 SDL 目录并加载配置与文件（不执行分析，便于测试分析期错误）。
 *
 * @param {import('node:test').TestContext} t 测试上下文
 * @param {Record<string, string>} sdlFiles 相对路径 → SDL 内容
 * @returns {Promise<{tempDir: string, config: object, files: object[]}>}
 */
async function setupSdl(t, sdlFiles) {
  const tempDir = createTempDir()
  t.after(() => removeDir(tempDir))

  const schemaDir = join(tempDir, 'sdl')
  writeFiles(schemaDir, sdlFiles)
  const configPath = writeConfig(tempDir, {
    schemaDir,
    outputDir: join(tempDir, 'generated'),
  })

  const config = await loadConfig(configPath)
  return { tempDir, config, files: loadSdlFiles(config.schemaDir) }
}

/**
 * 断言回调抛出指定错误码。
 *
 * @param {() => unknown} action 执行动作
 * @param {string} code 期望错误码
 */
function expectCodegenError(action, code) {
  try {
    action()
  } catch (error) {
    assertCodegenError(error, code)
    return
  }
  assert.fail(`期望抛出 ${code}，但未抛出任何错误`)
}

test('分析：根字段携带来源文件、包装信息与 @type 映射', async (t) => {
  const { config, files } = await setupSdl(t, {
    'Base.graphql': BASE_SDL,
    'SampleQueryResolver.graphql': QUERY_SDL,
    'SampleMutationResolver.graphql': MUTATION_SDL,
  })
  const analysis = analyzeSdl(files, config)

  assert.deepEqual(
    [...analysis.typeDefs.keys()].sort(),
    ['SampleRequest', 'SampleResponse', 'SampleStatus'],
  )
  assert.equal(analysis.typeDefs.get('SampleResponse').kind, 'object')
  assert.equal(analysis.typeDefs.get('SampleRequest').kind, 'input')
  assert.equal(analysis.typeDefs.get('SampleStatus').kind, 'enum')

  assert.equal(analysis.rootFields.length, 3)
  const listSample = analysis.rootFields.find((field) => field.name === 'listSample')
  assert.equal(listSample.operationType, 'Query')
  assert.equal(listSample.sourceBaseName, 'SampleQueryResolver')
  assert.equal(listSample.wrapper, undefined)

  const pageSample = analysis.rootFields.find((field) => field.name === 'pageSample')
  assert.deepEqual(
    { kind: pageSample.wrapper.kind, target: pageSample.wrapper.target },
    { kind: 'page', target: 'SampleResponse' },
  )
  assert.equal(pageSample.returnTypeName, 'SampleResponseDataPage')

  const createSample = analysis.rootFields.find((field) => field.name === 'createSample')
  assert.deepEqual(
    { kind: createSample.wrapper.kind, target: createSample.wrapper.target },
    { kind: 'business', target: 'Boolean' },
  )

  assert.equal(analysis.wrappers.get('SampleResponseDataPage').kind, 'page')
  assert.equal(analysis.fqcnToTypeName.get('io.example.SampleResponse'), 'SampleResponse')
  assert.ok(analysis.knownTypeNames.has('SampleRequest'))
})

test('分析：同一 FQCN 映射到多个类型时抛 E005', async (t) => {
  const { config, files } = await setupSdl(t, {
    'Base.graphql': BASE_SDL.replace(
      '"io.example.SampleRequest"',
      '"io.example.SampleResponse"',
    ),
    'SampleQueryResolver.graphql': QUERY_SDL,
  })

  expectCodegenError(() => analyzeSdl(files, config), 'E005')
})

test('分析：Schema 类型命中保留名时抛 E006', async (t) => {
  const { config, files } = await setupSdl(t, {
    'Base.graphql': `type Query
type Page {
    id: String
}
scalar String
`,
  })

  expectCodegenError(() => analyzeSdl(files, config), 'E006')
})

test('分析：类型重复定义时抛 E004', async (t) => {
  const { config, files } = await setupSdl(t, {
    'A.graphql': 'type Query\ntype Duplicated {\n    id: String\n}\nscalar String\n',
    'B.graphql': 'type Duplicated {\n    id: String\n}\n',
  })

  expectCodegenError(() => analyzeSdl(files, config), 'E004')
})

test('分析：同一字段使用多个包装指令时抛 E004', async (t) => {
  const { config, files } = await setupSdl(t, {
    'Base.graphql': BASE_SDL,
    'Bad.graphql': `extend type Query {
    bad: SampleResponseDataPage @page(for: "SampleResponse") @commonBusinessResponse(for: "SampleResponse")
}
`,
  })

  expectCodegenError(() => analyzeSdl(files, config), 'E004')
})

test('Schema：包装目标类型不存在时抛 E004 并提示字段与目标', async (t) => {
  const { config, files } = await setupSdl(t, {
    'Base.graphql': BASE_SDL,
    'Bad.graphql': `extend type Query {
    bad: MissingResponseDataPage @page(for: "MissingResponse")
}
`,
  })
  const analysis = analyzeSdl(files, config)

  try {
    buildCompletedSchema(analysis, config)
    assert.fail('期望抛出 E004')
  } catch (error) {
    assertCodegenError(error, 'E004')
    assert.match(error.message, /MissingResponse/)
    assert.match(error.message, /bad/)
  }
})

test('Operation：文件命名符合 <SDL名>.<Query|Mutation>.<字段名>.graphql', async (t) => {
  const { config, files } = await setupSdl(t, {
    'Base.graphql': BASE_SDL,
    'SampleQueryResolver.graphql': QUERY_SDL,
    'SampleMutationResolver.graphql': MUTATION_SDL,
  })
  const analysis = analyzeSdl(files, config)

  const { files: operationFiles, operations } = emitOperations(analysis)
  const queryField = analysis.rootFields.find((field) => field.name === 'listSample')
  assert.equal(
    buildOperationFileName(queryField),
    'SampleQueryResolver.Query.listSample.graphql',
  )

  assert.deepEqual(
    [...operationFiles.keys()].sort(),
    [
      'operations/SampleMutationResolver.Mutation.createSample.graphql',
      'operations/SampleQueryResolver.Query.listSample.graphql',
      'operations/SampleQueryResolver.Query.pageSample.graphql',
    ],
  )
  assert.equal(operations.length, 3)
})

test('Schema：补全包装类型后所有 Operation 校验通过', async (t) => {
  const { config, files } = await setupSdl(t, {
    'Base.graphql': BASE_SDL,
    'SampleQueryResolver.graphql': QUERY_SDL,
    'SampleMutationResolver.graphql': MUTATION_SDL,
  })
  const analysis = analyzeSdl(files, config)

  const { operations } = emitOperations(analysis)
  const schema = buildCompletedSchema(analysis, config)
  validateOperationDocuments(schema, operations)

  for (const operation of operations) {
    assert.deepEqual(validate(schema, operation.document), [])
  }
})

test('Selection：object 字段存在必填参数时抛 E008', async (t) => {
  const { config, files } = await setupSdl(t, {
    'Base.graphql': `type Query
scalar String

type NeedyResponse {
    id: String
    child(id: String!): String
}

type AttachmentResponse {
    data: NeedyResponse
}

extend type Query {
    attachment: AttachmentResponse
}
`,
  })
  const analysis = analyzeSdl(files, config)

  try {
    emitOperations(analysis)
    assert.fail('期望抛出 E008')
  } catch (error) {
    assertCodegenError(error, 'E008')
    assert.match(error.message, /NeedyResponse/)
    assert.match(error.message, /child/)
  }
})

test('Operation 校验：非法选择集抛 E007', async (t) => {
  const { config, files } = await setupSdl(t, {
    'Base.graphql': BASE_SDL,
    'SampleQueryResolver.graphql': QUERY_SDL,
    'SampleMutationResolver.graphql': MUTATION_SDL,
  })
  const analysis = analyzeSdl(files, config)

  const schema = buildCompletedSchema(analysis, config)
  const invalidOperation = {
    field: { name: 'badOperation' },
    fileName: 'Bad.graphql',
    document: parse('query badOperation { notExist }'),
  }

  try {
    validateOperationDocuments(schema, [invalidOperation])
    assert.fail('期望抛出 E007')
  } catch (error) {
    assertCodegenError(error, 'E007')
    assert.match(error.message, /Operation 校验失败/)
  }
})
