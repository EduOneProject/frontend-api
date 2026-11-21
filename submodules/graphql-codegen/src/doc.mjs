/**
 * 模块职责：解析 SDL 描述（JavaDoc 风格文本）并渲染为 TypeScript JSDoc。
 *
 * 输入：字段 / 类型 / 枚举值描述、`@type` FQCN 映射、Schema 已知类型名。
 * 输出：
 *   - 方法 JSDoc（含 @param / @returns / @see）；
 *   - 类型、字段、枚举值的描述注释；
 *   - `@see` 中 `{@link Type}` 的转换结果。
 * 关键约束：
 *   - `@return` 统一输出为 `@returns`；
 *   - 全限定名只允许通过 `@type` 映射整体精确匹配，禁止部分替换（设计文档 7.8.3）。
 */
const PARAM_PATTERN = /^@param\s+(\S+)\s*(.*)$/
const TAG_PATTERN = /^@([A-Za-z]+)\b\s*(.*)$/

/**
 * `@see` 分词：优先整体匹配已有 `{@link ...}`，其次全限定名，最后简单标识符。
 * 这样可保证全限定名不会被拆成“包名 + 类名”并只替换类名部分。
 */
const SEE_TOKEN_PATTERN = /\{@link [^}]*\}|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+|[A-Za-z_$][\w$]*/g

/**
 * 解析 SDL 描述文本。
 *
 * @param {string | undefined} description SDL 描述（GraphQL 已自动去除公共缩进）
 * @returns {{body: string[], params: Array<{name: string, description: string}>, returns: string | null, sees: string[]}}
 */
export function parseDescription(description) {
  const parsed = { body: [], params: [], returns: null, sees: [] }
  if (!description) {
    return parsed
  }

  const lines = normalizeLines(description)
  for (const line of lines) {
    const paramMatch = PARAM_PATTERN.exec(line)
    if (paramMatch) {
      parsed.params.push({ name: paramMatch[1], description: paramMatch[2].trim() })
      continue
    }

    const tagMatch = TAG_PATTERN.exec(line)
    if (tagMatch) {
      const [, tag, rest] = tagMatch
      if (tag === 'return' || tag === 'returns') {
        parsed.returns = rest.trim()
        continue
      }
      if (tag === 'see') {
        parsed.sees.push(rest.trim())
        continue
      }
      // 其他 `@` 标签按设计文档 7.8.1 保留为正文，继续落入下方 body
    }

    parsed.body.push(line)
  }

  // 标签块之前的分隔空行不应进入正文，否则渲染时会与标签前的空行重复
  while (parsed.body.length > 0 && parsed.body[parsed.body.length - 1] === '') {
    parsed.body.pop()
  }

  return parsed
}

/**
 * 将描述文本拆分为行，并去掉首尾空行（保留正文中的空行）。
 *
 * @param {string} description 描述文本
 * @returns {string[]} 行数组，每行已去除首尾空白
 */
function normalizeLines(description) {
  const lines = description.split(/\r?\n/).map((line) => line.trim())
  while (lines.length > 0 && lines[0] === '') {
    lines.shift()
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

/**
 * 转换 `@see` 内容中的引用为 `{@link Type}`。
 *
 * @param {string} content `@see` 后的内容
 * @param {{fqcnToTypeName: Map<string, string>, knownTypeNames: Set<string>}} context 解析上下文
 * @returns {string} 转换后的内容
 */
export function transformSee(content, context) {
  return content.replace(SEE_TOKEN_PATTERN, (token) => {
    if (token.startsWith('{@link')) {
      return token
    }
    if (token.includes('.')) {
      const mapped = context.fqcnToTypeName.get(token)
      // 未命中的全限定名整段保留，禁止只替换类名部分
      return mapped ? `{@link ${mapped}}` : token
    }
    return context.knownTypeNames.has(token) ? `{@link ${token}}` : token
  })
}

/**
 * 渲染方法 JSDoc。
 *
 * @param {string | undefined} description 字段描述
 * @param {string[]} argumentNames GraphQL 参数名，按定义顺序
 * @param {{fqcnToTypeName: Map<string, string>, knownTypeNames: Set<string>}} context 解析上下文
 * @param {string} [indent] 缩进前缀
 * @returns {string} JSDoc 文本；无任何内容时返回空字符串
 */
export function renderMethodJsDoc(description, argumentNames, context, indent = '') {
  const { body, params, returns, sees } = parseDescription(description)

  const tagLines = params.map(
    (param) => `@param ${param.name}${param.description ? ` ${param.description}` : ''}`,
  )
  // 设计文档 7.8.2：每个 GraphQL 参数必须有 @param，缺少描述时至少输出参数名
  for (const name of argumentNames) {
    if (!params.some((param) => param.name === name)) {
      tagLines.push(`@param ${name}`)
    }
  }
  if (returns) {
    tagLines.push(`@returns ${returns}`)
  }
  for (const see of sees) {
    tagLines.push(`@see ${transformSee(see, context)}`)
  }

  const lines = [...body]
  if (tagLines.length > 0) {
    if (lines.length > 0) {
      lines.push('')
    }
    lines.push(...tagLines)
  }

  return renderJsDocBlock(lines, indent)
}

/**
 * 渲染类型 / 字段描述 JSDoc，原样保留描述文本（含非标准 `@` 标签）。
 *
 * @param {string | undefined} description 描述文本
 * @param {string} [indent] 缩进前缀
 * @returns {string} JSDoc 文本；描述为空时返回空字符串
 */
export function renderDescriptionJsDoc(description, indent = '') {
  if (!description) {
    return ''
  }
  return renderJsDocBlock(normalizeLines(description), indent)
}

/**
 * 渲染单行场景的内联 JSDoc（枚举值使用）。
 *
 * @param {string | undefined} description 描述文本
 * @param {string} [indent] 缩进前缀
 * @returns {string} 单行时输出 `/** 描述 *\/`，多行时输出块注释
 */
export function renderInlineJsDoc(description, indent = '') {
  if (!description) {
    return ''
  }
  const lines = normalizeLines(description)
  if (lines.length === 1) {
    return `${indent}/** ${lines[0]} */`
  }
  return renderJsDocBlock(lines, indent)
}

/**
 * 渲染标准 JSDoc 块。
 *
 * @param {string[]} lines 注释行（不含 `*` 前缀）
 * @param {string} indent 缩进前缀
 * @returns {string} JSDoc 文本
 */
function renderJsDocBlock(lines, indent) {
  if (lines.length === 0) {
    return ''
  }
  const rendered = lines.map((line) => `${indent} *${line ? ` ${line}` : ''}`)
  return [`${indent}/**`, ...rendered, `${indent} */`].join('\n')
}
