/**
 * OpenCode 适配器 (anomalyco/opencode，原 sst/opencode)
 *
 * ⚠️ 重要：OpenCode 仓库已从 sst/opencode 迁移到 anomalyco/opencode
 * 全局配置文件: ~/.config/opencode/opencode.json (不是 config.json!)
 * 格式: JSON/JSONC，provider 配置格式如下:
 *
 * {
 *   "$schema": "https://opencode.ai/config.json",
 *   "model": "anthropic/claude-sonnet-4-5",
 *   "provider": {
 *     "anthropic": {
 *       "options": {
 *         "baseURL": "https://api.holysheep.ai",
 *         "apiKey": "cr_xxx"
 *       }
 *     },
 *     "openai": {
 *       "options": {
 *         "baseURL": "https://api.holysheep.ai/v1",
 *         "apiKey": "cr_xxx"
 *       }
 *     }
 *   }
 * }
 *
 * 安装方式(推荐): brew install anomalyco/tap/opencode
 * 或: npm i -g opencode-ai@latest
 * 官方文档: https://opencode.ai/docs/config
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

function getConfigFile() {
  const candidates = [
    // 新版标准路径（官方文档）
    path.join(os.homedir(), '.config', 'opencode', 'opencode.json'),
    // 旧版路径兼容
    path.join(os.homedir(), '.config', 'opencode', 'config.json'),
    path.join(os.homedir(), '.opencode', 'opencode.json'),
    path.join(os.homedir(), '.opencode', 'config.json'),
    // Windows
    path.join(os.homedir(), 'AppData', 'Roaming', 'opencode', 'opencode.json'),
  ]
  for (const f of candidates) {
    if (fs.existsSync(f)) return f
  }
  // 默认路径（新版标准）
  return path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
}

function readConfig() {
  const file = getConfigFile()
  try {
    if (fs.existsSync(file)) {
      // 支持 JSONC（带注释的 JSON）
      const content = fs.readFileSync(file, 'utf8')
      return JSON.parse(content.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))
    }
  } catch {}
  return {}
}

function writeConfig(data) {
  const file = getConfigFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

module.exports = {
  name: 'OpenCode',
  id: 'opencode',
  checkInstalled() {
    return require('../utils/which').commandExists('opencode')
  },
  isConfigured() {
    const c = readConfig()
    return !!(
      c.provider?.anthropic?.options?.baseURL?.includes('holysheep') ||
      c.provider?.openai?.options?.baseURL?.includes('holysheep')
    )
  },
  configure(apiKey, baseUrlAnthropicNoV1, baseUrlOpenAI) {
    const config = readConfig()
    if (!config.provider) config.provider = {}

    // 设置 schema（方便编辑器自动补全）
    if (!config['$schema']) config['$schema'] = 'https://opencode.ai/config.json'

    // 配置 Anthropic provider（Claude 模型）
    config.provider.anthropic = {
      options: {
        baseURL: baseUrlAnthropicNoV1,  // https://api.holysheep.ai (无 /v1)
        apiKey,
      },
    }

    // 配置 OpenAI provider（GPT 模型）
    config.provider.openai = {
      options: {
        baseURL: baseUrlOpenAI,  // https://api.holysheep.ai/v1
        apiKey,
      },
    }

    // 设置默认模型
    if (!config.model) {
      config.model = 'anthropic/claude-sonnet-4-5'
    }

    writeConfig(config)
    return { file: getConfigFile(), hot: false }
  },
  reset() {
    const config = readConfig()
    if (config.provider) {
      delete config.provider.anthropic
      delete config.provider.openai
    }
    writeConfig(config)
  },
  getConfigPath() { return getConfigFile() },
  hint: '切换后重启 OpenCode 生效；配置文件: ~/.config/opencode/opencode.json',
  installCmd: 'brew install anomalyco/tap/opencode  # 或: npm i -g opencode-ai@latest',
  docsUrl: 'https://opencode.ai',
}
