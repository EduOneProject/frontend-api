/**
 * 模块职责：定义生成器错误码与可读错误信息。
 *
 * 输入：各模块抛出的 CodegenError。
 * 输出：CLI 统一格式化后的 stderr 文本。
 * 关键约束：所有错误必须携带设计文档第 9 章定义的错误码，CLI 以退出码 1 结束。
 */

/** 错误码定义，编号与设计文档第 9 章保持一致 */
export const ERROR_DEFINITIONS = {
  E001: '配置文件不存在',
  E002: '配置缺少必填项或路径非法',
  E003: 'SDL 解析失败',
  E004: '内存 Schema 构建失败',
  E005: '@type 重复映射',
  E006: '保留名冲突',
  E007: 'Operation 校验失败',
  E008: 'Selection 遇到必填参数字段',
  E009: 'Operation 文件名重复',
  E010: '方法工厂名重复',
  E011: '产物写入失败',
  E012: '--check 内容不一致',
}

/**
 * 生成器错误
 *
 * 触发条件：配置非法、SDL 非法、Schema 无法构建、Operation 校验失败等生成期问题。
 */
export class CodegenError extends Error {
  /**
   * @param {'E001'|'E002'|'E003'|'E004'|'E005'|'E006'|'E007'|'E008'|'E009'|'E010'|'E011'|'E012'} code 错误码
   * @param {string} message 错误摘要，必须包含足够的上下文（文件、字段、类型）
   * @param {string[]} [details] 补充信息，逐行输出
   */
  constructor(code, message, details = []) {
    super(message)
    this.name = 'CodegenError'
    this.code = code
    this.details = details
  }

  /**
   * 格式化为 CLI 输出文本
   *
   * @returns {string} 形如 `[E007] Operation 校验失败: ...` 的多行文本
   */
  format() {
    const title = ERROR_DEFINITIONS[this.code] ?? '未知错误'
    const lines = [`[${this.code}] ${title}: ${this.message}`]
    for (const detail of this.details) {
      lines.push(`  - ${detail}`)
    }
    return lines.join('\n')
  }
}
