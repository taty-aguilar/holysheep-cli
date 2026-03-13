/**
 * Continue.dev 适配器 (VS Code / JetBrains 插件)
 *
 * ⚠️ 重要：Continue 新版本已将配置文件从 config.json 迁移到 config.yaml (YAML格式)
 * 配置文件: ~/.continue/config.yaml (优先) 或 ~/.continue/config.json (旧版兼容)
 *
 * YAML 格式示例:
 * models:
 *   - name: HolySheep Claude Sonnet
 *     provider: openai
 *     model: claude-sonnet-4-5
 *     apiKey: cr_xxx
 *     apiBase: https://api.holysheep.ai/v1
 *
 * Continue 支持 OpenAI 兼容 provider，可接入任何兼容端点
 * 官方文档: https://docs.continue.dev
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const CONTINUE_DIR = path.join(os.homedir(), '.continue')
const CONFIG_YAML  = path.join(CONTINUE_DIR, 'config.yaml')
const CONFIG_JSON  = path.join(CONTINUE_DIR, 'config.json')

function getConfigFile() {
  // 优先使用 config.yaml (新版)
  if (fs.existsSync(CONFIG_YAML)) return { file: CONFIG_YAML, format: 'yaml' }
  if (fs.existsSync(CONFIG_JSON)) return { file: CONFIG_JSON, format: 'json' }
  // 默认创建 yaml
  return { file: CONFIG_YAML, format: 'yaml' }
}

function readJsonConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_JSON, 'utf8'))
  } catch {
    return { models: [] }
  }
}

function writeJsonConfig(data) {
  fs.mkdirSync(CONTINUE_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_JSON, JSON.stringify(data, null, 2), 'utf8')
}

function readYamlRaw() {
  try {
    if (fs.existsSync(CONFIG_YAML)) return fs.readFileSync(CONFIG_YAML, 'utf8')
  } catch {}
  return ''
}

/**
 * 写入 YAML 配置（简单字符串追加/替换方式，不依赖 yaml 库）
 * 先移除已有 HolySheep 模型块，再在 models: 下插入新的
 */
function writeYamlConfig(apiKey, baseUrl, models) {
  fs.mkdirSync(CONTINUE_DIR, { recursive: true })

  let content = readYamlRaw()

  // 移除旧的 holysheep 模型块（以 "  - name: HolySheep" 开头到下一个 "  - " 或 EOF）
  content = content.replace(/  - name: HolySheep[^\n]*\n(    [^\n]*\n)*/g, '')

  // 如果没有 models: 段，则加上
  if (!content.includes('models:')) {
    content = 'models:\n' + content
  }

  // 构建要插入的模型 YAML 块
  const modelBlocks = models.map(m => [
    `  - name: ${m.name}`,
    `    provider: openai`,
    `    model: ${m.model}`,
    `    apiKey: ${apiKey}`,
    `    apiBase: ${baseUrl}`,
  ].join('\n')).join('\n')

  // 在 models: 之后插入
  content = content.replace('models:\n', `models:\n${modelBlocks}\n`)

  fs.writeFileSync(CONFIG_YAML, content.replace(/\n{3,}/g, '\n\n').trimStart(), 'utf8')
}

const HS_MODELS = [
  { name: 'HolySheep — Claude Sonnet', model: 'claude-sonnet-4-6' },
  { name: 'HolySheep — Claude Opus',   model: 'claude-opus-4-6'   },
]

module.exports = {
  name: 'Continue.dev',
  id: 'continue',
  checkInstalled() {
    return fs.existsSync(CONTINUE_DIR)
  },
  isConfigured() {
    if (fs.existsSync(CONFIG_YAML)) {
      return readYamlRaw().includes('holysheep')
    }
    const c = readJsonConfig()
    return (c.models || []).some(m => m.apiBase?.includes('holysheep'))
  },
  configure(apiKey, _baseUrlAnthropicNoV1, baseUrlOpenAI) {
    const { format } = getConfigFile()

    if (format === 'yaml') {
      writeYamlConfig(apiKey, baseUrlOpenAI, HS_MODELS)
      return { file: CONFIG_YAML, hot: true }
    } else {
      // 兼容旧版 JSON 格式
      const config = readJsonConfig()
      config.models = (config.models || []).filter(m => !m.apiBase?.includes('holysheep'))
      config.models = [
        ...HS_MODELS.map(m => ({
          title: m.name,
          provider: 'openai',
          model: m.model,
          apiKey,
          apiBase: baseUrlOpenAI,
        })),
        ...config.models,
      ]
      writeJsonConfig(config)
      return { file: CONFIG_JSON, hot: true }
    }
  },
  reset() {
    if (fs.existsSync(CONFIG_YAML)) {
      let content = readYamlRaw()
      content = content.replace(/  - name: HolySheep[^\n]*\n(    [^\n]*\n)*/g, '')
      fs.writeFileSync(CONFIG_YAML, content, 'utf8')
    }
    if (fs.existsSync(CONFIG_JSON)) {
      const config = readJsonConfig()
      config.models = (config.models || []).filter(m => !m.apiBase?.includes('holysheep'))
      writeJsonConfig(config)
    }
  },
  getConfigPath() { return fs.existsSync(CONFIG_YAML) ? CONFIG_YAML : CONFIG_JSON },
  hint: '新版使用 config.yaml；配置后在 VS Code Continue 面板选择 HolySheep 模型',
  launchCmd: null,  // VS Code 插件，在编辑器内使用
  launchNote: '在 VS Code 侧边栏打开 Continue 面板即可使用',
  installCmd: 'VS Code 插件市场搜索 "Continue"',
  docsUrl: 'https://continue.dev',
}
