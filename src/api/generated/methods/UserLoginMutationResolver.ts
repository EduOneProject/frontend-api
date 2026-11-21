/* eslint-disable */
// 由 graphql-codegen 自动生成，请勿手动修改

import type { Executor } from '../executor'
import type { LoginWithPasswordRequest } from '../types/inputs'
import type { CommonBusinessResponse, UserLoginSuccessResponse } from '../types/outputs'
import loginWithPasswordDocument from '../operations/UserLoginMutationResolver.Mutation.loginWithPassword.graphql?raw'

export function createUserLoginMutationResolverMethods(execute: Executor) {
  return {
    /**
     * 以密码方式登录
     *
     * @param request 登录请求参数
     * @returns 登录结果
     */
    async loginWithPassword(request: LoginWithPasswordRequest = {}): Promise<CommonBusinessResponse<UserLoginSuccessResponse> | null> {
      const data = await execute<Record<string, CommonBusinessResponse<UserLoginSuccessResponse> | null>>({
        method: 'loginWithPassword',
        query: loginWithPasswordDocument,
        variables: { request },
      })
      return data.loginWithPassword ?? null
    },
  }
}
