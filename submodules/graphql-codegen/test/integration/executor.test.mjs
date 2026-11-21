/**
 * 集成测试：生成物 executor 的运行时行为。
 *
 * 输入：本地 node:http mock 服务 + 生成物 `src/api/generated/executor.ts`。
 * 输出：验证 `?method=` 查询参数、请求体结构、返回值解包、GraphQLRequestError 与 axios 原始错误。
 * 关键约束：
 *   - 测试直接导入生成物（Node 原生 TypeScript 类型剥离），确保测的是真实产物；
 *   - 不发起任何外部网络请求，全部请求落在本机回环地址。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import axios from 'axios'
import { GraphQLRequestError, createExecutor } from '../../../../src/api/generated/executor.ts'

const LOGOUT_QUERY = 'mutation logout { logout { data code message } }'

/**
 * 启动一个本地 mock GraphQL 服务。
 *
 * @param {import('node:test').TestContext} t 测试上下文
 * @param {(record: {method: string, url: string, body: object}) => {status?: number, body: object}} responder 响应函数
 * @param {(context: {baseURL: string, requests: object[]}) => Promise<void>} run 测试主体
 * @returns {Promise<void>}
 */
async function withMockServer(t, responder, run) {
  const requests = []
  const server = createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => {
      const record = {
        method: request.method,
        url: request.url,
        body: raw ? JSON.parse(raw) : null,
      }
      requests.push(record)

      const { status = 200, body } = responder(record)
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const address = server.address()
  await run({ baseURL: `http://127.0.0.1:${address.port}`, requests })
}

test('执行器：请求地址追加 ?method=，请求体为 { query, variables }，返回值直接解包 data', async (t) => {
  const payload = { logout: { data: true, code: '200', message: '成功' } }
  const variables = { request: { account: 'admin' } }

  await withMockServer(
    t,
    () => ({ body: { data: payload } }),
    async ({ baseURL, requests }) => {
      const http = axios.create({ baseURL })
      const execute = createExecutor({ http })

      const data = await execute({ method: 'logout', query: LOGOUT_QUERY, variables })

      assert.deepEqual(data, payload)
      assert.equal(requests.length, 1)
      assert.equal(requests[0].method, 'POST')
      assert.equal(requests[0].url, '/graphql?method=logout')
      assert.deepEqual(requests[0].body, { query: LOGOUT_QUERY, variables })
    },
  )
})

test('执行器：未传 variables 时请求体变量默认为空对象', async (t) => {
  await withMockServer(
    t,
    () => ({ body: { data: { logout: null } } }),
    async ({ baseURL, requests }) => {
      const execute = createExecutor({ http: axios.create({ baseURL }) })
      await execute({ method: 'logout', query: LOGOUT_QUERY })

      assert.deepEqual(requests[0].body, { query: LOGOUT_QUERY, variables: {} })
    },
  )
})

test('执行器：支持自定义 endpoint，method 参数仍按根字段名追加', async (t) => {
  await withMockServer(
    t,
    () => ({ body: { data: { logout: null } } }),
    async ({ baseURL, requests }) => {
      const execute = createExecutor({ http: axios.create({ baseURL }), endpoint: '/api/graphql' })
      await execute({ method: 'logout', query: LOGOUT_QUERY })

      assert.equal(requests[0].url, '/api/graphql?method=logout')
    },
  )
})

test('执行器：GraphQL errors[] 拒绝为 GraphQLRequestError，扩展信息可类型化读取', async (t) => {
  const errorPayload = {
    errors: [
      {
        message: '未登录',
        locations: [],
        extensions: {
          retryable: false,
          code: 401000001,
          classification: 'UNAUTHORIZED',
        },
      },
    ],
  }

  await withMockServer(
    t,
    () => ({ body: errorPayload }),
    async ({ baseURL }) => {
      const execute = createExecutor({ http: axios.create({ baseURL }) })

      await assert.rejects(execute({ method: 'logout', query: LOGOUT_QUERY }), (error) => {
        assert.ok(error instanceof GraphQLRequestError)
        assert.equal(error.name, 'GraphQLRequestError')
        assert.equal(error.message, '未登录')
        assert.equal(error.method, 'logout')
        assert.equal(error.errors.length, 1)
        assert.equal(error.errors[0].extensions.code, 401000001)
        assert.equal(error.errors[0].extensions.classification, 'UNAUTHORIZED')
        assert.equal(error.errors[0].extensions.retryable, false)
        assert.deepEqual(error.response, errorPayload)
        return true
      })
    },
  )
})

test('执行器：HTTP 层错误保持 axios 原始错误，不包装为 GraphQLRequestError', async (t) => {
  await withMockServer(
    t,
    () => ({ status: 500, body: { message: 'boom' } }),
    async ({ baseURL }) => {
      const execute = createExecutor({ http: axios.create({ baseURL }) })

      await assert.rejects(execute({ method: 'logout', query: LOGOUT_QUERY }), (error) => {
        assert.equal(error.isAxiosError, true)
        assert.equal(error.response.status, 500)
        assert.ok(!(error instanceof GraphQLRequestError))
        return true
      })
    },
  )
})
