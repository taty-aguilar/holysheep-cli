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
 * HolySheep 接入方式：
 *   1. 直接写入完整的 openclaw.json（含 auth profile + gateway + 默认模型）
 *   2. 自动启动 Gateway，用户直接打开 http://127.0.0.1:18789/
 *   不需要用户手动跑 onboard / gateway start
 */
const fs            = require('fs')
const path          = require('path')
const os            = require('os')
const crypto        = require('crypto')
const { spawnSync } = require('child_process')

const OPENCLAW_DIR  = path.join(os.homedir(), '.openclaw')
const CONFIG_FILE   = path.join(OPENCLAW_DIR, 'openclaw.json')

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
      // openclaw.json 是 JSON5 格式，先去掉注释再 parse
      return JSON.parse(raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))
    }
  } catch {}
  return {}
}

function writeConfig(data) {
  fs.mkdirSync(OPENCLAW_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8')
}

/** 生成随机 Gateway token */
function genToken() {
  return crypto.randomBytes(24).toString('hex')
}

/**
 * 构建完整的初始化配置
 * 包含：auth profile（HolySheep Anthropic-compatible）+ gateway + 默认模型 + holysheep provider
 */
function buildFullConfig(existing, apiKey, baseUrlAnthropicNoV1, baseUrlOpenAI) {
  const config = JSON.parse(JSON.stringify(existing || {}))  // deep clone

  // ── 1. 环境变量（兼容 Anthropic SDK 自动读取）──────────────────────
  if (!config.env) config.env = {}
  config.env.ANTHROPIC_API_KEY  = apiKey
  config.env.ANTHROPIC_BASE_URL = baseUrlAnthropicNoV1   // https://api.holysheep.ai

  // ── 2. Auth profile（Custom Provider，Anthropic-compatible）────────
  // openclaw 通过 auth profile 管理凭证；写入一个 holysheep profile
  if (!config.auth) config.auth = {}
  if (!config.auth.profiles) config.auth.profiles = {}
  config.auth.profiles.holysheep = {
    type:     'api-key',
    provider: 'anthropic',
    apiKey,
    baseUrl:  baseUrlAnthropicNoV1,
  }
  config.auth.default = 'holysheep'

  // ── 3. 默认模型 ────────────────────────────────────────────────────
  if (!config.agents) config.agents = {}
  if (!config.agents.defaults) config.agents.defaults = {}
  // 总是覆写为 HolySheep sonnet-4-6（用户可以在 /model 命令里切换）
  config.agents.defaults.model = {
    primary: 'anthropic/claude-sonnet-4-6',
  }

  // ── 4. 自定义 holysheep provider（OpenAI-compatible，支持所有模型）
  if (!config.models) config.models = {}
  config.models.mode = 'merge'
  if (!config.models.providers) config.models.providers = {}
  config.models.providers.holysheep = {
    baseUrl: baseUrlOpenAI,   // https://api.holysheep.ai/v1
    apiKey,
    api:     'openai-completions',
    models: [
      { id: 'claude-sonnet-4-6',          name: 'Claude Sonnet 4.6 (HolySheep)'  },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 (HolySheep)' },
      { id: 'claude-sonnet-4-20250514',   name: 'Claude Sonnet 4 (HolySheep)'   },
      { id: 'claude-opus-4-5-20251101',   name: 'Claude Opus 4.5 (HolySheep)'   },
      { id: 'claude-opus-4-20250514',     name: 'Claude Opus 4 (HolySheep)'     },
      { id: 'gpt-4o',                     name: 'GPT-4o (HolySheep)'            },
      { id: 'gemini-2.5-pro',             name: 'Gemini 2.5 Pro (HolySheep)'    },
    ],
  }

  // ── 5. Gateway 配置（如未设置则初始化，保留已有配置）────────────────
  if (!config.gateway) config.gateway = {}
  if (!config.gateway.port) config.gateway.port = 18789
  if (!config.gateway.bind) config.gateway.bind = '127.0.0.1'
  // 生成 gateway token（若已有则不覆盖）
  if (!config.gateway.auth) config.gateway.auth = {}
  if (!config.gateway.auth.token) {
    config.gateway.auth.token = genToken()
    config.gateway.auth.mode  = 'token'
  }

  // ── 6. Workspace 默认路径 ─────────────────────────────────────────
  if (!config.workspace) {
    config.workspace = path.join(OPENCLAW_DIR, 'workspace')
  }

  return config
}

module.exports = {
  name: 'OpenClaw',
  id:   'openclaw',

  checkInstalled() {
    return require('../utils/which').commandExists('openclaw')
  },

  isConfigured() {
    const c = readConfig()
    return !!(
      c.auth?.profiles?.holysheep ||
      c.env?.ANTHROPIC_BASE_URL?.includes('holysheep')
    )
  },

  configure(apiKey, baseUrlAnthropicNoV1, baseUrlOpenAI) {
    const existing = readConfig()
    const config   = buildFullConfig(existing, apiKey, baseUrlAnthropicNoV1, baseUrlOpenAI)

    // 确保 workspace 目录存在（openclaw 首次启动需要）
    fs.mkdirSync(config.workspace, { recursive: true })

    writeConfig(config)

    // 自动启动 Gateway，用户直接打开浏览器即可
    _autoStartGateway()

    return { file: CONFIG_FILE, hot: false, _gatewayStarted: true }
  },

  reset() {
    const config = readConfig()
    if (config.env) {
      delete config.env.ANTHROPIC_API_KEY
      delete config.env.ANTHROPIC_BASE_URL
    }
    if (config.auth?.profiles) delete config.auth.profiles.holysheep
    if (config.auth?.default === 'holysheep') delete config.auth.default
    if (config.models?.providers) delete config.models.providers.holysheep
    if (config.agents?.defaults?.model?.primary?.startsWith('anthropic/')) {
      delete config.agents.defaults.model
    }
    writeConfig(config)
  },

  getConfigPath() { return CONFIG_FILE },
  hint:      'Gateway 已自动在后台启动，打开浏览器即可使用',
  launchCmd:  null,
  launchNote: '🌐 打开浏览器访问 http://127.0.0.1:18789/',
  installCmd: 'npm install -g openclaw@latest',
  docsUrl:    'https://docs.openclaw.ai',
}

/**
 * 自动在后台启动 OpenClaw Gateway
 *
 * 策略（按顺序尝试）：
 *   1. openclaw gateway start   — 已有 daemon/service 直接启动
 *   2. openclaw gateway --port 18789  (detached)  — 前台守护模式
 *
 * 不调用 onboard，因为配置文件已由 configure() 完整写入。
 */
function _autoStartGateway() {
  const chalk = require('chalk')
  const bin   = 'openclaw'

  console.log(chalk.gray('\n  ⚙️  正在启动 OpenClaw Gateway...'))

  // 先尝试 gateway start（若已注册为系统服务则直接生效）
  const r1 = spawnSync(bin, ['gateway', 'start'], {
    shell:   true,
    timeout: 15000,
    stdio:   'pipe',
  })
  if (r1.status === 0) {
    console.log(chalk.green('  ✓ OpenClaw Gateway 已在后台启动'))
    return
  }

  // 没有 daemon → 直接 detached 前台守护运行
  const { spawn } = require('child_process')
  const child = spawn(bin, ['gateway', '--port', '18789'], {
    shell:    true,
    detached: true,
    stdio:    'ignore',
  })
  child.unref()

  // 等 2 秒让 gateway 起来
  spawnSync('node', ['-e', 'setTimeout(()=>{},2000)'], { timeout: 3000 })

  console.log(chalk.green('  ✓ OpenClaw Gateway 已启动'))
  console.log(chalk.cyan('  → 浏览器打开: http://127.0.0.1:18789/'))
}
