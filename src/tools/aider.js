/**
 * Aider 适配器
 * Aider 是最流行的命令行 AI 结对编程工具
 *
 * 配置方式:
 *   环境变量: AIDER_OPENAI_API_BASE + OPENAI_API_KEY
 *   或: --openai-api-base + --anthropic-api-key
 *
 * Aider 支持 litellm 格式，可以接入任何 OpenAI 兼容端点
 * 配置文件: ~/.aider.conf.yml
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const CONFIG_FILE = path.join(os.homedir(), '.aider.conf.yml')

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return fs.readFileSync(CONFIG_FILE, 'utf8')
  } catch {}
  return ''
}

function removeHsBlock(content) {
  const lines = content.split('\n')
  const result = []
  let skip = false
  for (const line of lines) {
    if (line.includes('# holysheep-cli')) { skip = true; continue }
    if (skip && line.startsWith('#')) { skip = false }
    if (!skip) result.push(line)
  }
  return result.join('\n')
}

module.exports = {
  name: 'Aider',
  id: 'aider',
  checkInstalled() {
    return require('../utils/which').commandExists('aider')
  },
  isConfigured() {
    const content = readConfig()
    return content.includes('holysheep')
  },
  configure(apiKey, _baseUrlAnthropicNoV1, baseUrlOpenAI) {
    let content = readConfig()
    content = removeHsBlock(content)
    // Aider 用 openai-api-base（OpenAI 兼容格式，带 /v1）
    // model 格式: openai/<model-name> 表示使用 OpenAI 兼容接口
    const block = `
# holysheep-cli managed — https://holysheep.ai
openai-api-key: ${apiKey}
openai-api-base: ${baseUrlOpenAI}
model: openai/claude-sonnet-4-5
`
    content += block
    fs.writeFileSync(CONFIG_FILE, content.trim() + '\n', 'utf8')
    return { file: CONFIG_FILE, hot: false }
  },
  reset() {
    let content = readConfig()
    content = removeHsBlock(content)
    fs.writeFileSync(CONFIG_FILE, content, 'utf8')
  },
  getConfigPath() { return CONFIG_FILE },
  hint: '也可用 aider --openai-api-base https://api.holysheep.ai/v1',
  installCmd: 'pip install aider-chat',
  docsUrl: 'https://aider.chat',
  // Aider 优先用环境变量
  envVars: (apiKey, baseUrlOpenAI) => ({
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: baseUrlOpenAI,
    AIDER_OPENAI_API_BASE: baseUrlOpenAI,
  }),
}
