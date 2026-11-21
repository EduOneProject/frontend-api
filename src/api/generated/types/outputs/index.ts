/* eslint-disable */
// 由 graphql-codegen 自动生成，请勿手动修改

/**
 * 通用业务响应体
 */
export interface CommonBusinessResponse<T> {
  /**
   * 响应码
   */
  code: string | null
  /**
   * 响应消息
   */
  message: string | null
  /**
   * 响应数据
   */
  data: T | null
}

/**
 * 分页信息
 */
export interface Page<T> {
  /**
   * 当前页
   */
  pageNo: number | null
  /**
   * 每页数据数量
   */
  pageSize: number | null
  /**
   * 当前页数据信息
   */
  currentPageData: Array<T | null> | null
  /**
   * 总数量
   */
  totalSize: number | null
}

/**
 * 业务字典信息响应体
 */
export interface BusinessDictionaryResponse {
  /**
   * 字典ID
   */
  id: string | null
  /**
   * 字典类型
   */
  type: string | null
  /**
   * 字典编码
   */
  code: string | null
  /**
   * 字典名称
   */
  name: string | null
  /**
   * 上级字典ID
   */
  parentId: string | null
  /**
   * 字典状态
   */
  status: string | null
  /**
   * 排序
   */
  sort: number | null
  /**
   * 更新人用户ID
   */
  updateUserId: string | null
  /**
   * 更新时间
   */
  updateTime: string | null
  /**
   * 创建人用户ID
   */
  createUserId: string | null
  /**
   * 创建时间
   */
  createTime: string | null
}

/**
 * 业务字典类型信息响应体
 */
export interface BusinessDictionaryTypeResponse {
  /**
   * 字典类型
   */
  type: string | null
  /**
   * 字典类型名称
   */
  name: string | null
  /**
   * 字典类型描述
   */
  desc: string | null
  /**
   * 更新人用户ID
   */
  updateUserId: string | null
  /**
   * 更新时间
   */
  updateTime: string | null
  /**
   * 创建人用户ID
   */
  createUserId: string | null
  /**
   * 创建时间
   */
  createTime: string | null
}

/**
 * 图形验证码响应内容
 */
export interface ImageCaptchaResponse {
  /**
   * 经过base64编码后的验证码图片
   */
  imageBase64: string | null
  /**
   * 业务Token
   */
  token: string | null
}

/**
 * 地区树查询响应
 */
export interface RegionTreeResponse {
  /**
   * 地区ID
   */
  id: string | null
  /**
   * 地区编码
   */
  code: string | null
  /**
   * 上级地区ID
   */
  parentId: string | null
  /**
   * 上级地区编码
   */
  parentCode: string | null
  /**
   * 地区路径
   */
  path: string | null
  /**
   * 地区层级
   */
  level: number | null
  /**
   * 地区名称
   */
  name: string | null
  /**
   * 地区排序
   */
  sort: number | null
  /**
   * 地区状态
   */
  status: string | null
}

/**
 * 轮换令牌响应
 */
export interface RotateAccessTokenResponse {
  /**
   * 访问令牌
   */
  accessToken: string | null
  /**
   * 刷新令牌
   */
  refreshToken: string | null
}

/**
 * 用户登录成功响应体
 */
export interface UserLoginSuccessResponse {
  /**
   * 用户ID
   */
  userId: string | null
  /**
   * 访问令牌
   */
  accessToken: string | null
  /**
   * 刷新令牌
   */
  refreshToken: string | null
}
