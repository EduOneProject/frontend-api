/* eslint-disable */
// 由 graphql-codegen 自动生成，请勿手动修改

import type { BusinessDictionarySortField, BusinessDictionaryTypeSortField, OrderDirection } from '../enums'

/**
 * 获取验证码请求体
 */
export interface ApplyImageCaptchaRequest {
  /**
   * 验证场景
   */
  verificationScene?: string | null
  /**
   * 验证上下文token
   */
  token?: string | null
}

/**
 * 业务字典查询条件请求体
 */
export interface BusinessDictionaryRequest {
  /**
   * 字典ID集合
   */
  idList?: Array<string | null> | null
  /**
   * 字典类型
   */
  type?: string | null
  /**
   * 上级字典ID
   */
  parentId?: string | null
  /**
   * 字典编码集合
   */
  codeList?: Array<string | null> | null
}

/**
 * 业务字典排序条件请求体
 */
export interface BusinessDictionarySortRequest {
  /**
   * 排序字段
   */
  field?: BusinessDictionarySortField | null
  /**
   * 排序方向
   */
  direction?: OrderDirection | null
}

/**
 * 业务字典类型查询条件请求体
 */
export interface BusinessDictionaryTypeRequest {
  /**
   * 字典类型名称
   */
  name?: string | null
}

/**
 * 业务字典类型排序条件请求体
 */
export interface BusinessDictionaryTypeSortRequest {
  /**
   * 排序字段
   */
  field?: BusinessDictionaryTypeSortField | null
  /**
   * 排序方向
   */
  direction?: OrderDirection | null
}

/**
 * 验证图形验证码请求体
 */
export interface ImageCaptchaValidRequest {
  /**
   * 验证场景
   */
  verificationScene?: string | null
  /**
   * 校验上下文token
   */
  token?: string | null
  /**
   * 验证码
   */
  code?: string | null
}

/**
 * 以密码登录请求体
 */
export interface LoginWithPasswordRequest {
  /**
   * 账号
   */
  account?: string | null
  /**
   * 密码
   */
  password?: string | null
  /**
   * 验证上下文token
   */
  token?: string | null
}

/**
 * 分页请求条件
 */
export interface PageRequest {
  /**
   * 当前页码
   */
  pageNo?: number | null
  /**
   * 每页数量
   */
  pageSize?: number | null
}

/**
 * 地区树查询条件
 */
export interface RegionTreeQueryRequest {
  /**
   * 上级地区ID，-1表示顶级
   */
  parentIdList?: Array<string | null> | null
  /**
   * 上级地区编码，-1表示顶级
   */
  parentCodeList?: Array<string | null> | null
  /**
   * 地区ID，-1表示顶级
   */
  idList?: Array<string | null> | null
  /**
   * 地区编码，-1表示顶级
   */
  codeList?: Array<string | null> | null
  /**
   * 地区状态
   */
  status?: string | null
}
