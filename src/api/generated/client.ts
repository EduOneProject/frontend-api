/* eslint-disable */
// 由 graphql-codegen 自动生成，请勿手动修改

import { createExecutor } from './executor'
import type { ApiOptions } from './executor'
import { createAuthMutationResolverMethods } from './methods/AuthMutationResolver'
import { createBusinessDictionaryQueryResolverMethods } from './methods/BusinessDictionaryQueryResolver'
import { createRegionTreeQueryResolverMethods } from './methods/RegionTreeQueryResolver'
import { createUserLoginMutationResolverMethods } from './methods/UserLoginMutationResolver'
import { createValidationMutationResolverMethods } from './methods/ValidationMutationResolver'

export * from './executor'

export function createApi(options: ApiOptions) {
  const execute = createExecutor(options)

  return {
    ...createAuthMutationResolverMethods(execute),
    ...createBusinessDictionaryQueryResolverMethods(execute),
    ...createRegionTreeQueryResolverMethods(execute),
    ...createUserLoginMutationResolverMethods(execute),
    ...createValidationMutationResolverMethods(execute),
  }
}
