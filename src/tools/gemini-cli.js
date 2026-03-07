/**
 * Gemini CLI 适配器 (@google/gemini-cli)
 *
 * ⚠️ 重要：Gemini CLI 不支持自定义 base_url/中继
 * 它只能连接 Google 官方 Gemini API。
 *
 * 配置方式：
 * 1. settings.json 写入 selectedAuthType = "gemini-api-key"（跳过登录向导）
 * 2. 设置环境变量 GEMINI_API_KEY（需要 Google Gemini API Key，从 aistudio.google.com 获取）
 *
 * HolySheep 暂不支持 Gemini CLI 中继（Gemini CLI 使用 Google 专有协议，非 OpenAI 兼容格式）
 * 建议用户使用 Claude Code / Codex / Aider 等支持中继的工具。
 */
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const GEMINI_DIR     = path.join(os.homedir(), '.gemini')
const SETTINGS_FILE  = path.join(GEMINI_DIR, 'settings.json')

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
    }
  } catch {}
  return {}
}

function writeSettings(data) {
  if (!fs.existsSync(GEMINI_DIR)) fs.mkdirSync(GEMINI_DIR, { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8')
}

module.exports = {
  name: 'Gemini CLI',
  id: 'gemini-cli',

  checkInstalled() {
    return require('../utils/which').commandExists('gemini')
  },

  isConfigured() {
    // 检查是否设置了 GEMINI_API_KEY 环境变量
    if (process.env.GEMINI_API_KEY) return true
    // 检查 settings.json 是否已跳过向导
    const s = readSettings()
    return s.selectedAuthType === 'gemini-api-key'
  },

  configure(apiKey, _baseUrlAnthropicNoV1, _baseUrlOpenAI) {
    // Gemini CLI 不支持 HolySheep 中继，只能配置为使用官方 Gemini API Key 模式
    // 写入 settings.json 跳过认证向导
    const settings = readSettings()
    settings.selectedAuthType = 'gemini-api-key'
    writeSettings(settings)

    // 环境变量：GEMINI_API_KEY 需要用户自己的 Google Gemini API Key
    // HolySheep API Key (cr_xxx) 无法用于 Gemini CLI
    return {
      file: SETTINGS_FILE,
      hot: false,
      // 不注入 GEMINI_API_KEY，因为 HolySheep key 对 Gemini CLI 无效
      // 用户需要手动设置真正的 Gemini API Key
      envVars: {},
      warning: 'Gemini CLI 需要 Google 官方 Gemini API Key，无法使用 HolySheep 中继。\n请从 https://aistudio.google.com/apikey 获取 API Key 后设置环境变量：\n  export GEMINI_API_KEY="your-google-api-key"',
    }
  },

  reset() {
    const settings = readSettings()
    delete settings.selectedAuthType
    writeSettings(settings)
  },

  getConfigPath() { return SETTINGS_FILE },
  hint: 'Gemini CLI 不支持 HolySheep 中继，需使用 Google 官方 Gemini API Key',
  installCmd: 'npm install -g @google/gemini-cli',
  docsUrl: 'https://github.com/google-gemini/gemini-cli',
  envVarFormat: 'gemini',
  unsupported: true, // 标记为不支持中继
}
