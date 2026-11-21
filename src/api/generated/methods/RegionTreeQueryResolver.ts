/* eslint-disable */
// 由 graphql-codegen 自动生成，请勿手动修改

import type { Executor } from '../executor'
import type { RegionTreeQueryRequest } from '../types/inputs'
import type { RegionTreeResponse } from '../types/outputs'
import listRegionTreeDocument from '../operations/RegionTreeQueryResolver.Query.listRegionTree.graphql?raw'

export function createRegionTreeQueryResolverMethods(execute: Executor) {
  return {
    /**
     * 查询地区树信息
     *
     * @param request 查询参数
     * @returns 地区树
     */
    async listRegionTree(request: RegionTreeQueryRequest = {}): Promise<Array<RegionTreeResponse | null> | null> {
      const data = await execute<Record<string, Array<RegionTreeResponse | null> | null>>({
        method: 'listRegionTree',
        query: listRegionTreeDocument,
        variables: { request },
      })
      return data.listRegionTree ?? null
    },
  }
}
