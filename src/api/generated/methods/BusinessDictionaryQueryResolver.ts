/* eslint-disable */
// 由 graphql-codegen 自动生成，请勿手动修改

import type { Executor } from '../executor'
import type { BusinessDictionaryRequest, BusinessDictionarySortRequest, BusinessDictionaryTypeRequest, BusinessDictionaryTypeSortRequest, PageRequest } from '../types/inputs'
import type { BusinessDictionaryResponse, BusinessDictionaryTypeResponse, Page } from '../types/outputs'
import listBusinessDictionaryDocument from '../operations/BusinessDictionaryQueryResolver.Query.listBusinessDictionary.graphql?raw'
import listBusinessDictionaryTypeDocument from '../operations/BusinessDictionaryQueryResolver.Query.listBusinessDictionaryType.graphql?raw'
import pageBusinessDictionaryDocument from '../operations/BusinessDictionaryQueryResolver.Query.pageBusinessDictionary.graphql?raw'
import pageBusinessDictionaryTypeDocument from '../operations/BusinessDictionaryQueryResolver.Query.pageBusinessDictionaryType.graphql?raw'

export function createBusinessDictionaryQueryResolverMethods(execute: Executor) {
  return {
    /**
     * 查询业务字典
     *
     * @param request 查询参数
     * @param sortList 排序参数
     * @returns 业务字典列表
     */
    async listBusinessDictionary(
      request: BusinessDictionaryRequest = {},
      sortList: Array<BusinessDictionarySortRequest | null> | null = null,
    ): Promise<Array<BusinessDictionaryResponse | null> | null> {
      const data = await execute<Record<string, Array<BusinessDictionaryResponse | null> | null>>({
        method: 'listBusinessDictionary',
        query: listBusinessDictionaryDocument,
        variables: { request, sortList },
      })
      return data.listBusinessDictionary ?? null
    },
    /**
     * 查询业务字典类型
     *
     * @param request 查询参数
     * @param sortList 排序参数
     * @returns 业务字典类型列表
     */
    async listBusinessDictionaryType(
      request: BusinessDictionaryTypeRequest = {},
      sortList: Array<BusinessDictionaryTypeSortRequest | null> | null = null,
    ): Promise<Array<BusinessDictionaryTypeResponse | null> | null> {
      const data = await execute<Record<string, Array<BusinessDictionaryTypeResponse | null> | null>>({
        method: 'listBusinessDictionaryType',
        query: listBusinessDictionaryTypeDocument,
        variables: { request, sortList },
      })
      return data.listBusinessDictionaryType ?? null
    },
    /**
     * 分页查询业务字典
     *
     * @param page 分页参数
     * @param request 查询参数
     * @param sortList 排序参数
     * @returns 业务字典列表
     */
    async pageBusinessDictionary(
      page: PageRequest = {},
      request: BusinessDictionaryRequest = {},
      sortList: Array<BusinessDictionarySortRequest | null> | null = null,
    ): Promise<Page<BusinessDictionaryResponse> | null> {
      const data = await execute<Record<string, Page<BusinessDictionaryResponse> | null>>({
        method: 'pageBusinessDictionary',
        query: pageBusinessDictionaryDocument,
        variables: { page, request, sortList },
      })
      return data.pageBusinessDictionary ?? null
    },
    /**
     * 分页查询业务字典类型
     *
     * @param page 分页参数
     * @param request 查询参数
     * @param sortList 排序参数
     * @returns 业务字典类型列表
     */
    async pageBusinessDictionaryType(
      page: PageRequest = {},
      request: BusinessDictionaryTypeRequest = {},
      sortList: Array<BusinessDictionaryTypeSortRequest | null> | null = null,
    ): Promise<Page<BusinessDictionaryTypeResponse> | null> {
      const data = await execute<Record<string, Page<BusinessDictionaryTypeResponse> | null>>({
        method: 'pageBusinessDictionaryType',
        query: pageBusinessDictionaryTypeDocument,
        variables: { page, request, sortList },
      })
      return data.pageBusinessDictionaryType ?? null
    },
  }
}
