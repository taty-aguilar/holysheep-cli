/**
 * OpenCode 适配器 (sst/opencode)
 * 配置文件: ~/.config/opencode/config.json 或 ~/.opencode/config.json
 * 格式: JSON，支持 providers 数组
 *
 * OpenCode provider 格式:
 * {
 *   "providers": {
 *     "anthropic": {
 *       "apiKey": "cr_xxx",
 *       "baseURL": "https://api.holysheep.ai"
 *     },
 *     "openai": {
 *       "apiKey": "cr_xxx",
 *       "baseURL": "https://api.holysheep.ai/v1"
 *     }
 *   }
 * }
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

function getConfigFile() {
  const candidates = [
    path.join(os.homedir(), '.config', 'opencode', 'config.json'),
    path.join(os.homedir(), '.opencode', 'config.json'),
    // Windows
    path.join(os.homedir(), 'AppData', 'Roaming', 'opencode', 'config.json'),
  ]
  for (const f of candidates) {
    if (fs.existsSync(f)) return f
  }
  // 默认路径
  return path.join(os.homedir(), '.config', 'opencode', 'config.json')
}

function readConfig() {
  const file = getConfigFile()
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
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
    return !!(c.providers?.anthropic?.baseURL?.includes('holysheep') ||
              c.providers?.openai?.baseURL?.includes('holysheep'))
  },
  configure(apiKey, baseUrlAnthropicNoV1, baseUrlOpenAI) {
    const config = readConfig()
    if (!config.providers) config.providers = {}
    config.providers.anthropic = {
      apiKey,
      baseURL: baseUrlAnthropicNoV1,
    }
    config.providers.openai = {
      apiKey,
      baseURL: baseUrlOpenAI,
    }
    writeConfig(config)
    return { file: getConfigFile(), hot: false }
  },
  reset() {
    const config = readConfig()
    if (config.providers) {
      delete config.providers.anthropic
      delete config.providers.openai
    }
    writeConfig(config)
  },
  getConfigPath() { return getConfigFile() },
  hint: '切换后重启 OpenCode 生效',
  installCmd: 'npm install -g opencode-ai',
  docsUrl: 'https://github.com/sst/opencode',
}
