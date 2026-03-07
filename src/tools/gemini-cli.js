/**
 * Gemini CLI 适配器 (@google/gemini-cli)
 *
 * Gemini CLI 目前不原生支持自定义 base_url，
 * 但可通过以下方式接入 OpenAI 兼容端点:
 *
 * 方式 A（推荐）: 写入 ~/.gemini/settings.json 中的 otherAIProvider
 *   支持 openaiCompatible 类型，需要 Gemini CLI >= 0.20
 *
 * 方式 B: 通过 GEMINI_API_KEY 环境变量 + GOOGLE_API_KEY 覆盖
 *   （仅适用于少数版本）
 *
 * 实际测试: Gemini CLI 0.30.0 支持 otherAIProvider 配置
 * 参考: https://github.com/google-gemini/gemini-cli/blob/main/docs/configuration.md
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const SETTINGS_FILE = path.join(os.homedir(), '.gemini', 'settings.json')

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    }
  } catch {}
  return {}
}

function writeSettings(data) {
  const dir = path.dirname(SETTINGS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8')
}

module.exports = {
  name: 'Gemini CLI',
  id: 'gemini-cli',
  checkInstalled() {
    return require('../utils/which').commandExists('gemini')
  },
  isConfigured() {
    const s = readSettings()
    return !!(s.otherAIProvider?.url?.includes('holysheep'))
  },
  configure(apiKey, baseUrlOpenAI) {
    const settings = readSettings()

    // Gemini CLI 的 otherAIProvider 支持 OpenAI 兼容格式
    settings.otherAIProvider = {
      url: baseUrlOpenAI,   // 带 /v1
      apiKey: apiKey,
      model: 'claude-sonnet-4-5',  // 默认推荐模型
    }

    // 同时保留原有 general 配置
    writeSettings(settings)
    return { file: SETTINGS_FILE, hot: false }
  },
  reset() {
    const settings = readSettings()
    delete settings.otherAIProvider
    writeSettings(settings)
  },
  getConfigPath() { return SETTINGS_FILE },
  hint: '使用 gemini -m claude-sonnet-4-5 指定模型',
  installCmd: 'npm install -g @google/gemini-cli',
  docsUrl: 'https://github.com/google-gemini/gemini-cli',
}
