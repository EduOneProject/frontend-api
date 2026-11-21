/**
 * graphql-codegen 配置文件
 *
 * 相对路径以本文件所在目录（frontend-api/）为基准解析。
 */

export default {
  // 必填：后端 SDL 目录
  schemaDir: '../backend/eduone-web/src/main/resources/graphql',

  // 必填：生成物输出目录
  outputDir: 'src/api/generated',

  // 可选：GraphQL 接口地址，默认 /graphql
  endpoint: '/graphql',

  // 可选：固定泛型类型名
  genericNames: {
    businessResponse: 'CommonBusinessResponse',
    page: 'Page',
  },

  // 可选：SDL 标量到 TS 类型的映射
  scalars: {
    Long: 'number',
    DateTime: 'string',
    Date: 'string',
  },

  // 可选：生成文件头
  header: [
    '/* eslint-disable */',
    '// 由 graphql-codegen 自动生成，请勿手动修改',
  ],
}
