/**
 * 模块职责：生成物 API 的编译期类型断言。
 *
 * 该文件只参与 `test/type/type-check.test.mjs` 的 tsc 编译，不进入业务构建。
 * 关键约束：错误的参数类型与不存在的字段必须通过 `@ts-expect-error` 被 tsc 拒绝。
 */
import { GraphQLRequestError, createApi } from '../../../../src/api/generated'
import type {
  BusinessDictionaryResponse,
  CommonBusinessResponse,
  Executor,
  Page,
} from '../../../../src/api/generated'

declare const api: ReturnType<typeof createApi>

export async function typeAssertions(): Promise<void> {
  const page = await api.pageBusinessDictionary({ pageNo: 1, pageSize: 20 }, { type: 'GENDER' }, null)
  const typedPage: Page<BusinessDictionaryResponse> | null = page
  const firstName: string | null | undefined = typedPage?.currentPageData?.[0]?.name
  void firstName

  // @ts-expect-error BusinessDictionaryResponse 不存在 notExist 字段
  typedPage?.currentPageData?.[0]?.notExist

  // @ts-expect-error pageNo 必须是 number | null，字符串不被接受
  await api.pageBusinessDictionary({ pageNo: '1' })

  const logoutResult: CommonBusinessResponse<boolean> | null = await api.logout()
  const code: string | null | undefined = logoutResult?.code
  void code

  const regionTree = await api.listRegionTree({ status: '1' })
  const regionId: string | null | undefined = regionTree?.[0]?.id
  void regionId

  // @ts-expect-error 返回值是数组，不能按对象属性访问
  regionTree?.id

  const execute: Executor = async <T>(options: { method: string; query: string; variables?: unknown }): Promise<T> => {
    void options
    throw new Error('not implemented')
  }
  void execute

  const graphqlError = new GraphQLRequestError('logout', [], {})
  const errorCode: number | string | undefined = graphqlError.errors[0]?.extensions?.code
  const classification: string | undefined = graphqlError.errors[0]?.extensions?.classification
  const retryable: boolean | undefined = graphqlError.errors[0]?.extensions?.retryable
  void errorCode
  void classification
  void retryable
}
