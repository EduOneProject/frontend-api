/**
 * 模块职责：生成产物根目录的 `executor.ts`、`client.ts`、`index.ts` 与 `raw.d.ts`。
 *
 * 输入：方法工厂清单、规范化配置。
 * 输出：`Map<相对路径, 文件内容>`。
 * 关键约束：
 *   - executor.ts 只承载 axios 执行器、执行参数、错误类型与 GraphQLRequestError；
 *   - 每次请求通过 axios params 追加 `method=<根字段名>`，不手工拼接 URL；
 *   - HTTP 层错误由 axios 原样抛出，GraphQL errors[] 必须 reject GraphQLRequestError。
 */
import { assembleFile } from './types.mjs'

/**
 * 生成根级文件。
 *
 * @param {{factories: Array<{factoryName: string, baseName: string}>, config: object}} input 生成输入
 * @returns {Map<string, string>} 相对路径 → 文件内容
 */
export function emitClient({ factories, config }) {
  const files = new Map()
  files.set('executor.ts', renderExecutor(config))
  files.set('client.ts', renderClient(factories, config))
  files.set('index.ts', renderIndex(config))
  files.set('raw.d.ts', renderRawDeclaration(config))
  return files
}

/**
 * 生成 executor.ts。
 *
 * @param {object} config 规范化配置
 * @returns {string} 文件内容
 */
function renderExecutor(config) {
  const body = `import type { AxiosInstance } from 'axios'

/** 客户端配置 */
export interface ApiOptions {
  /** GraphQL 接口地址，默认 ${config.endpoint} */
  endpoint?: string
  /** axios 实例，可自行配置 baseURL / 拦截器 / 鉴权头 */
  http: AxiosInstance
}

/** 单次请求参数 */
export interface ExecuteOptions {
  /** 当前调用的方法名，作为 ${config.endpoint}?method=xxx 的查询参数 */
  method: string
  /** GraphQL 文档文本 */
  query: string
  /** GraphQL 变量 */
  variables?: unknown
}

/** GraphQL 执行器 */
export interface Executor {
  <T>(options: ExecuteOptions): Promise<T>
}

/** GraphQL 错误位置 */
export interface GraphQLErrorLocation {
  line: number
  column: number
}

/** GraphQL 错误扩展信息 */
export interface GraphQLErrorExtensions {
  /** 是否可重试 */
  retryable?: boolean
  /** 错误码 */
  code?: number | string
  /** 错误分类，例如 UNAUTHORIZED */
  classification?: string
  [key: string]: unknown
}

/** GraphQL 错误项 */
export interface GraphQLErrorItem {
  message: string
  locations?: GraphQLErrorLocation[]
  path?: Array<string | number>
  extensions?: GraphQLErrorExtensions
}

/** GraphQL 响应体 */
export interface GraphQLResponse<T> {
  data?: T
  errors?: GraphQLErrorItem[]
}

/**
 * GraphQL 业务/鉴权错误
 * errors[] 存在时抛出，调用方按 axios 失败请求统一在 catch 中处理
 */
export class GraphQLRequestError extends Error {
  /** 当前调用的方法名 */
  readonly method: string
  /** GraphQL 原始错误列表 */
  readonly errors: GraphQLErrorItem[]
  /** GraphQL 原始响应体 */
  readonly response: GraphQLResponse<unknown>

  constructor(method: string, errors: GraphQLErrorItem[], response: GraphQLResponse<unknown>) {
    super(errors[0]?.message ?? \`GraphQL request failed: \${method}\`)
    this.name = 'GraphQLRequestError'
    this.method = method
    this.errors = errors
    this.response = response
  }
}

/**
 * 创建 GraphQL 执行器
 * 请求地址会追加 ?method=<方法名>，便于在控制台区分具体接口
 */
export function createExecutor(options: ApiOptions): Executor {
  const { http, endpoint = '${config.endpoint}' } = options

  return async function execute<T>({ method, query, variables = {} }: ExecuteOptions): Promise<T> {
    const response = await http.post(
      endpoint,
      { query, variables },
      { params: { method } },
    )

    const body = response.data as GraphQLResponse<T>
    if (body.errors?.length) {
      throw new GraphQLRequestError(method, body.errors, body)
    }
    return body.data as T
  }
}`

  return assembleFile(config, [], [body])
}

/**
 * 生成 client.ts：组合各 Resolver 方法工厂。
 *
 * @param {Array<{factoryName: string, baseName: string}>} factories 方法工厂清单
 * @param {object} config 规范化配置
 * @returns {string} 文件内容
 */
function renderClient(factories, config) {
  const imports = [
    "import { createExecutor } from './executor'",
    "import type { ApiOptions } from './executor'",
    ...factories.map(
      (factory) => `import { ${factory.factoryName} } from './methods/${factory.baseName}'`,
    ),
  ]

  const body = [
    "export * from './executor'",
    '',
    'export function createApi(options: ApiOptions) {',
    '  const execute = createExecutor(options)',
    '',
    '  return {',
    ...factories.map((factory) => `    ...${factory.factoryName}(execute),`),
    '  }',
    '}',
  ].join('\n')

  return assembleFile(config, imports, [body])
}

/**
 * 生成 index.ts：统一导出 createApi、执行器类型与业务类型。
 *
 * @param {object} config 规范化配置
 * @returns {string} 文件内容
 */
function renderIndex(config) {
  const body = ["export * from './client'", "export * from './types'"].join('\n')
  return assembleFile(config, [], [body])
}

/**
 * 生成 raw.d.ts：声明 Vite `?raw` 模块。
 *
 * @param {object} config 规范化配置
 * @returns {string} 文件内容
 */
function renderRawDeclaration(config) {
  const body = [
    "declare module '*.graphql?raw' {",
    '  const content: string',
    '  export default content',
    '}',
  ].join('\n')
  return assembleFile(config, [], [body])
}
