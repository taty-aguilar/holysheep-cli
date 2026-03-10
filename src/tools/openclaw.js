/**
 * OpenClaw 适配器 (v2 — 基于实测的正确配置格式)
 *
 * 正确方案：custom-api-key provider，配置在 models.providers 里
 * provider name 自动生成为 "custom-api-{hostname}"
 * 模型引用格式: "custom-api-holysheep-ai/claude-sonnet-4-6"
 *
 * 必须的 onboard 参数:
 *   --accept-risk --auth-choice custom-api-key
 *   --custom-base-url --custom-api-key --custom-model-id --custom-compatibility anthropic
 *   --install-daemon
 */
const fs   = require('fs')
const path = require('path')
const os   = require('os')
const { spawnSync, spawn, execSync } = require('child_process')

const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw')
const CONFIG_FILE  = path.join(OPENCLAW_DIR, 'openclaw.json')
const isWin        = process.platform === 'win32'

/** 运行 openclaw CLI */
function npx(...args) {
  return isWin
    ? spawnSync('npx', ['openclaw', ...args], { shell: true,  timeout: 30000, stdio: 'pipe' })
    : spawnSync('openclaw',           args,   { shell: false, timeout: 30000, stdio: 'pipe' })
}

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
      // 去掉 JSON5 注释再解析
      return JSON.parse(raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))
    }
  } catch {}
  return {}
}

module.exports = {
  name: 'OpenClaw',
  id:   'openclaw',

  checkInstalled() {
    if (require('../utils/which').commandExists('openclaw')) return true
    if (isWin) {
      try {
        execSync('npx openclaw --version', { stdio: 'ignore', timeout: 15000, shell: true })
        return true
      } catch {}
    }
    return false
  },

  isConfigured() {
    const cfg = JSON.stringify(readConfig())
    return cfg.includes('holysheep.ai')
  },

  configure(apiKey, baseUrl) {
    const chalk = require('chalk')
    console.log(chalk.gray('\n  ⚙️  正在配置 OpenClaw...'))

    // 1. 删除旧配置，确保 onboard 会重新写入
    try { fs.unlinkSync(CONFIG_FILE) } catch {}

    // 2. 用 openclaw 官方 onboard 命令写入正确配置
    //    这会生成完整的 models.providers.custom-api-holysheep-ai 配置
    console.log(chalk.gray('  → 写入配置...'))
    const result = npx(
      'onboard',
      '--non-interactive',
      '--accept-risk',
      '--auth-choice', 'custom-api-key',
      '--custom-base-url', baseUrl,
      '--custom-api-key', apiKey,
      '--custom-model-id', 'claude-sonnet-4-6',
      '--custom-compatibility', 'anthropic',
      '--install-daemon',
    )

    if (result.status !== 0) {
      // onboard 失败时 fallback：手写最小化配置
      console.log(chalk.yellow('  ⚠️  onboard 失败，使用备用配置...'))
      _writeFallbackConfig(apiKey, baseUrl)
    }

    // 3. 读取 token
    let token = ''
    try {
      token = readConfig()?.gateway?.auth?.token || ''
    } catch {}

    // 4. 启动 Gateway
    console.log(chalk.gray('  → 正在启动 Gateway...'))
    const ok = _startGateway()

    if (ok) {
      console.log(chalk.green('  ✓ OpenClaw Gateway 已启动'))
    } else {
      console.log(chalk.yellow('  ⚠️  Gateway 启动中，稍等几秒后刷新浏览器'))
    }

    const dashUrl = token
      ? `http://127.0.0.1:18789/?token=${token}`
      : 'http://127.0.0.1:18789/'
    console.log(chalk.cyan('\n  → 浏览器打开（含 token，直接可用）:'))
    console.log(chalk.bold.cyan(`     ${dashUrl}`))

    return { file: CONFIG_FILE, hot: false }
  },

  reset() {
    try { fs.unlinkSync(CONFIG_FILE) } catch {}
  },

  getConfigPath() { return CONFIG_FILE },
  hint: 'Gateway 已启动，打开浏览器即可使用',
  launchCmd: null,
  get launchNote() {
    try {
      const token = readConfig()?.gateway?.auth?.token
      if (token) return `🌐 浏览器打开（含 token）: http://127.0.0.1:18789/?token=${token}`
    } catch {}
    return '🌐 打开浏览器: http://127.0.0.1:18789/'
  },
  installCmd: 'npm install -g openclaw@latest',
  docsUrl:    'https://docs.openclaw.ai',
}

/** onboard 失败时的备用配置（基于实测的正确格式） */
function _writeFallbackConfig(apiKey, baseUrl) {
  const { randomBytes } = require('crypto')
  fs.mkdirSync(OPENCLAW_DIR, { recursive: true })

  const hostname = new URL(baseUrl).hostname.replace(/\./g, '-')
  const providerName = `custom-api-${hostname}`
  const token = randomBytes(24).toString('hex')

  const config = {
    models: {
      mode: 'merge',
      providers: {
        [providerName]: {
          baseUrl,
          apiKey,
          api: 'anthropic-messages',
          models: [{
            id: 'claude-sonnet-4-6',
            name: 'claude-sonnet-4-6 (HolySheep)',
            reasoning: false,
            input: ['text'],
            contextWindow: 200000,
            maxTokens: 16000,
          }],
        }
      }
    },
    agents: {
      defaults: {
        model: { primary: `${providerName}/claude-sonnet-4-6` }
      }
    },
    gateway: {
      mode: 'local',
      port: 18789,
      bind: 'loopback',
      auth: { mode: 'token', token },
    }
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
}

/** 启动 Gateway 后台进程 */
function _startGateway() {
  if (isWin) {
    spawnSync('cmd /c start cmd /k "npx openclaw gateway --port 18789"', [], {
      shell: true, timeout: 5000, stdio: 'ignore',
    })
  } else {
    const child = spawn('openclaw', ['gateway', '--port', '18789'], {
      detached: true, stdio: 'ignore',
    })
    child.unref()
  }

  // 等待最多 8 秒
  for (let i = 0; i < 8; i++) {
    const t = Date.now(); while (Date.now() - t < 1000) {}
    try {
      execSync(
        isWin
          ? 'powershell -NonInteractive -Command "try{(Invoke-WebRequest -Uri http://127.0.0.1:18789/ -TimeoutSec 1 -UseBasicParsing).StatusCode}catch{exit 1}"'
          : 'curl -sf http://127.0.0.1:18789/ -o /dev/null --max-time 1',
        { stdio: 'ignore', timeout: 3000 }
      )
      return true
    } catch {}
  }
  return false
}
