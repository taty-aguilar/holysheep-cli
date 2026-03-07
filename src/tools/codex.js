/**
 * Codex CLI 适配器 (@openai/codex v0.46+)
 *
 * 配置文件: ~/.codex/config.json（JSON 格式，不是 yaml）
 *
 * 正确格式:
 * {
 *   "model": "claude-sonnet-4-5",
 *   "provider": "holysheep",          // 指定默认 provider
 *   "providers": {
 *     "holysheep": {
 *       "name": "HolySheep",
 *       "baseURL": "https://api.holysheep.ai/v1",
 *       "envKey": "OPENAI_API_KEY"
 *     }
 *   }
 * }
 *
 * 环境变量: OPENAI_API_KEY（通过 envKey 指定）
 * 注意: Codex 会优先使用账号登录，需要设置 provider 才能绕过
 */
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const CONFIG_DIR  = path.join(os.homedir(), '.codex')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    }
  } catch {}
  return {}
}

function writeConfig(data) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8')
}

module.exports = {
  name: 'Codex CLI',
  id: 'codex',
  checkInstalled() {
    return require('../utils/which').commandExists('codex')
  },
  isConfigured() {
    const c = readConfig()
    return c.provider === 'holysheep' &&
           !!c.providers?.holysheep?.baseURL?.includes('holysheep')
  },
  configure(apiKey, _baseUrlAnthropicNoV1, baseUrlOpenAI) {
    const config = readConfig()

    // 设置 HolySheep 为默认 provider
    config.provider = 'holysheep'
    config.model    = config.model || 'claude-sonnet-4-5'

    if (!config.providers) config.providers = {}
    config.providers.holysheep = {
      name:    'HolySheep',
      baseURL: baseUrlOpenAI,   // https://api.holysheep.ai/v1
      envKey:  'OPENAI_API_KEY',
    }

    writeConfig(config)

    return {
      file: CONFIG_FILE,
      hot:  false,
      // 需要同时设置环境变量，供 envKey 读取
      envVars: {
        OPENAI_API_KEY:   apiKey,
        OPENAI_BASE_URL:  baseUrlOpenAI,
      },
    }
  },
  reset() {
    const config = readConfig()
    if (config.provider === 'holysheep') {
      delete config.provider
      delete config.providers?.holysheep
    }
    writeConfig(config)
  },
  getConfigPath() { return CONFIG_FILE },
  hint: '切换后重开终端生效；用 codex --provider holysheep 指定',
  installCmd: 'npm install -g @openai/codex',
  docsUrl: 'https://github.com/openai/codex',
  envVarFormat: 'openai',
}
