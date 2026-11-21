/* eslint-disable */
// 由 graphql-codegen 自动生成，请勿手动修改

import type { AxiosInstance } from 'axios'

/** 客户端配置 */
export interface ApiOptions {
  /** GraphQL 接口地址，默认 /graphql */
  endpoint?: string
  /** axios 实例，可自行配置 baseURL / 拦截器 / 鉴权头 */
  http: AxiosInstance
}

/** 单次请求参数 */
export interface ExecuteOptions {
  /** 当前调用的方法名，作为 /graphql?method=xxx 的查询参数 */
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
    super(errors[0]?.message ?? `GraphQL request failed: ${method}`)
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
  const { http, endpoint = '/graphql' } = options

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
}
