/**
 * Claude Code 适配器
 * 配置文件: ~/.claude/settings.json
 * 支持热切换（不需要重启终端）
 *
 * 官方 env 字段:
 *   ANTHROPIC_AUTH_TOKEN  — API Key (优先级最高)
 *   ANTHROPIC_BASE_URL    — 不带 /v1
 *   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC — 关闭遥测/更新检查
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json')

function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8')
    // Claude 的 settings.json 可能有控制字符，用容错解析
    return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, ' '))
  } catch {
    return {}
  }
}

function writeSettings(data) {
  const dir = path.dirname(SETTINGS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8')
}

module.exports = {
  name: 'Claude Code',
  id: 'claude-code',
  checkInstalled() {
    return require('../utils/which').commandExists('claude')
  },
  isConfigured() {
    const s = readSettings()
    return !!(s.env?.ANTHROPIC_AUTH_TOKEN || s.env?.ANTHROPIC_API_KEY)
  },
  configure(apiKey, baseUrl) {
    const settings = readSettings()
    if (!settings.env) settings.env = {}
    // Claude Code 用 ANTHROPIC_AUTH_TOKEN（最高优先级），兼容 ANTHROPIC_API_KEY
    settings.env.ANTHROPIC_AUTH_TOKEN = apiKey
    settings.env.ANTHROPIC_BASE_URL = baseUrl
    settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
    // 清理旧的同义字段
    delete settings.env.ANTHROPIC_API_KEY
    writeSettings(settings)
    return { file: SETTINGS_FILE, hot: true }
  },
  reset() {
    const settings = readSettings()
    if (settings.env) {
      delete settings.env.ANTHROPIC_AUTH_TOKEN
      delete settings.env.ANTHROPIC_API_KEY
      delete settings.env.ANTHROPIC_BASE_URL
      delete settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    }
    writeSettings(settings)
  },
  getConfigPath() { return SETTINGS_FILE },
  hint: '支持热切换，无需重启终端',
  installCmd: 'npm install -g @anthropic-ai/claude-code',
  docsUrl: 'https://docs.anthropic.com/claude-code',
}
