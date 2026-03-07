/**
 * OpenClaw 适配器
 * OpenClaw 是基于 Claude Code 架构的开源 AI 编程助手
 * 配置方式与 Claude Code 几乎相同，使用 Anthropic API 格式
 *
 * 配置文件: ~/.openclaw/settings.json (或 ~/.claude/settings.json 共享)
 * 环境变量: ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL
 *
 * OpenClaw 也支持通过 AGENTS.md 自定义 agent 行为
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

function getSettingsFile() {
  // OpenClaw 可能用独立配置，也可能共享 Claude 配置
  const openclaw = path.join(os.homedir(), '.openclaw', 'settings.json')
  const claude   = path.join(os.homedir(), '.claude', 'settings.json')
  if (fs.existsSync(openclaw)) return openclaw
  // 检查是否安装了 openclaw
  try {
    require('child_process').execSync('which openclaw', { stdio: 'ignore' })
    return openclaw
  } catch {
    return openclaw  // 默认路径
  }
}

function readSettings(file) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8').replace(/[\x00-\x1F\x7F]/g, ' '))
    }
  } catch {}
  return {}
}

function writeSettings(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

module.exports = {
  name: 'OpenClaw',
  id: 'openclaw',
  checkInstalled() {
    return require('../utils/which').commandExists('openclaw')
  },
  isConfigured() {
    const file = getSettingsFile()
    const s = readSettings(file)
    return !!(s.env?.ANTHROPIC_API_KEY || s.env?.ANTHROPIC_AUTH_TOKEN)
  },
  configure(apiKey, baseUrlAnthropicNoV1) {
    const file = getSettingsFile()
    const settings = readSettings(file)
    if (!settings.env) settings.env = {}
    settings.env.ANTHROPIC_API_KEY = apiKey
    settings.env.ANTHROPIC_BASE_URL = baseUrlAnthropicNoV1
    writeSettings(file, settings)
    return { file, hot: true }
  },
  reset() {
    const file = getSettingsFile()
    const settings = readSettings(file)
    if (settings.env) {
      delete settings.env.ANTHROPIC_API_KEY
      delete settings.env.ANTHROPIC_BASE_URL
    }
    writeSettings(file, settings)
  },
  getConfigPath() { return getSettingsFile() },
  hint: '配置方式同 Claude Code，支持热切换',
  installCmd: '请访问 openclaw 官网下载安装',
  docsUrl: 'https://github.com/iOfficeAI/AionUi',
}
