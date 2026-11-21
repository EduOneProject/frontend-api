/* eslint-disable */
// 由 graphql-codegen 自动生成，请勿手动修改

import type { Executor } from '../executor'
import type { CommonBusinessResponse, RotateAccessTokenResponse } from '../types/outputs'
import logoutDocument from '../operations/AuthMutationResolver.Mutation.logout.graphql?raw'
import rotateAccessTokenDocument from '../operations/AuthMutationResolver.Mutation.rotateAccessToken.graphql?raw'

export function createAuthMutationResolverMethods(execute: Executor) {
  return {
    /**
     * 登出
     *
     * @returns 是否登出成功
     */
    async logout(): Promise<CommonBusinessResponse<boolean> | null> {
      const data = await execute<Record<string, CommonBusinessResponse<boolean> | null>>({
        method: 'logout',
        query: logoutDocument,
      })
      return data.logout ?? null
    },
    /**
     * 轮换访问令牌
     *
     * @param refreshToken 刷新令牌
     * @returns 访问令牌和刷新令牌
     */
    async rotateAccessToken(refreshToken: string | null = null): Promise<CommonBusinessResponse<RotateAccessTokenResponse> | null> {
      const data = await execute<Record<string, CommonBusinessResponse<RotateAccessTokenResponse> | null>>({
        method: 'rotateAccessToken',
        query: rotateAccessTokenDocument,
        variables: { refreshToken },
      })
      return data.rotateAccessToken ?? null
    },
  }
}
