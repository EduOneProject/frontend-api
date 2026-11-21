/* eslint-disable */
// 由 graphql-codegen 自动生成，请勿手动修改

import type { Executor } from '../executor'
import type { ApplyImageCaptchaRequest, ImageCaptchaValidRequest } from '../types/inputs'
import type { CommonBusinessResponse, ImageCaptchaResponse } from '../types/outputs'
import applyImageCaptchaDocument from '../operations/ValidationMutationResolver.Mutation.applyImageCaptcha.graphql?raw'
import validateImageCaptchaDocument from '../operations/ValidationMutationResolver.Mutation.validateImageCaptcha.graphql?raw'
import requireVerificationContextDocument from '../operations/ValidationMutationResolver.Query.requireVerificationContext.graphql?raw'

export function createValidationMutationResolverMethods(execute: Executor) {
  return {
    /**
     * 请求图形验证码
     *
     * @param request 图形验证码请求参数
     * @returns 图形验证码信息
     */
    async applyImageCaptcha(request: ApplyImageCaptchaRequest = {}): Promise<CommonBusinessResponse<ImageCaptchaResponse> | null> {
      const data = await execute<Record<string, CommonBusinessResponse<ImageCaptchaResponse> | null>>({
        method: 'applyImageCaptcha',
        query: applyImageCaptchaDocument,
        variables: { request },
      })
      return data.applyImageCaptcha ?? null
    },
    /**
     * 校验图形验证码
     *
     * @param request 图形验证码校验请求参数
     * @returns 校验结果
     */
    async validateImageCaptcha(request: ImageCaptchaValidRequest = {}): Promise<CommonBusinessResponse<string> | null> {
      const data = await execute<Record<string, CommonBusinessResponse<string> | null>>({
        method: 'validateImageCaptcha',
        query: validateImageCaptchaDocument,
        variables: { request },
      })
      return data.validateImageCaptcha ?? null
    },
    /**
     * 请求验证上下文
     *
     * @param type 类型
     * @returns 验证上下文token字符串
     */
    async requireVerificationContext(type: string | null = null): Promise<string | null> {
      const data = await execute<Record<string, string | null>>({
        method: 'requireVerificationContext',
        query: requireVerificationContextDocument,
        variables: { type },
      })
      return data.requireVerificationContext ?? null
    },
  }
}
