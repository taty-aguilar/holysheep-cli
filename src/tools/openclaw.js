/**
 * OpenClaw 适配器 (github.com/openclaw/openclaw)
 *
 * OpenClaw 是个人 AI 助手 + 多渠道消息网关
 * 支持 WhatsApp/Telegram/Signal/Discord/iMessage 等 20+ 渠道
 *
 * 安装方式: npm install -g openclaw@latest
 * 配置文件: ~/.openclaw/openclaw.json (JSON5 格式)
 * 文档: https://docs.openclaw.ai
 *
 * HolySheep 接入方式：通过 env.ANTHROPIC_API_KEY + env.ANTHROPIC_BASE_URL
 * 设置 Anthropic provider 自定义 base URL 指向 HolySheep 中继
 */
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const OPENCLAW_DIR   = path.join(os.homedir(), '.openclaw')
const CONFIG_FILE    = path.join(OPENCLAW_DIR, 'openclaw.json')

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      // openclaw.json 是 JSON5 格式，先去掉注释再 parse
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
      return JSON.parse(raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))
    }
  } catch {}
  return {}
}

function writeConfig(data) {
  fs.mkdirSync(OPENCLAW_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8')
}

module.exports = {
  name: 'OpenClaw',
  id: 'openclaw',
  checkInstalled() {
    return require('../utils/which').commandExists('openclaw')
  },
  isConfigured() {
    const c = readConfig()
    return !!(
      c.env?.ANTHROPIC_BASE_URL?.includes('holysheep') ||
      c.models?.providers?.holysheep
    )
  },
  configure(apiKey, baseUrlAnthropicNoV1, baseUrlOpenAI) {
    const config = readConfig()

    // 设置环境变量 — Anthropic provider 使用 ANTHROPIC_BASE_URL 覆盖默认地址
    if (!config.env) config.env = {}
    config.env.ANTHROPIC_API_KEY  = apiKey
    config.env.ANTHROPIC_BASE_URL = baseUrlAnthropicNoV1  // https://api.holysheep.ai

    // 设置默认模型（如果未配置）
    if (!config.agents) config.agents = {}
    if (!config.agents.defaults) config.agents.defaults = {}
    if (!config.agents.defaults.model) {
      config.agents.defaults.model = { primary: 'anthropic/claude-sonnet-4-5' }
    }

    // 同时注册一个 holysheep 自定义 provider（支持所有模型）
    if (!config.models) config.models = {}
    config.models.mode = 'merge'
    if (!config.models.providers) config.models.providers = {}
    config.models.providers.holysheep = {
      baseUrl: baseUrlOpenAI,  // https://api.holysheep.ai/v1
      apiKey,
      api: 'openai-completions',
      models: [
        { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5 (HolySheep)' },
        { id: 'claude-opus-4-5',   name: 'Claude Opus 4.5 (HolySheep)'   },
        { id: 'gpt-5.4',           name: 'GPT-5.4 (HolySheep)'           },
        { id: 'gpt-5',             name: 'GPT-5 (HolySheep)'             },
      ],
    }

    writeConfig(config)
    return { file: CONFIG_FILE, hot: false }
  },
  reset() {
    const config = readConfig()
    if (config.env) {
      delete config.env.ANTHROPIC_API_KEY
      delete config.env.ANTHROPIC_BASE_URL
    }
    if (config.models?.providers) {
      delete config.models.providers.holysheep
    }
    // 如果默认模型是 anthropic/xxx，清掉
    if (config.agents?.defaults?.model?.primary?.startsWith('anthropic/')) {
      delete config.agents.defaults.model
    }
    writeConfig(config)
  },
  getConfigPath() { return CONFIG_FILE },
  hint: '切换后重启 OpenClaw 生效；支持 /model 命令切换模型',
  launchCmd: null,
  launchSteps: [
    { cmd: 'npx openclaw onboard',        note: '首次初始化（设置模型、鉴权等）' },
    { cmd: 'npx openclaw gateway start',  note: '启动后台 Gateway 服务'          },
    { cmd: 'npx openclaw dashboard',      note: '打开 WebUI → http://127.0.0.1:18789/' },
  ],
  installCmd: 'npm install -g openclaw@latest',
  docsUrl: 'https://docs.openclaw.ai',
}
