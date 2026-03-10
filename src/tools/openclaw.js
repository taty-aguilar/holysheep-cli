/**
 * OpenClaw 适配器
 *
 * 策略：直接写正确格式的 openclaw.json，然后 doctor --fix 迁移，
 * 最后用 wt/cmd 新窗口运行 gateway（Windows）或 detach（Unix）。
 *
 * 文档: https://docs.openclaw.ai
 */
const fs            = require('fs')
const path          = require('path')
const os            = require('os')
const crypto        = require('crypto')
const { spawnSync, spawn, execSync } = require('child_process')

const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw')
const CONFIG_FILE  = path.join(OPENCLAW_DIR, 'openclaw.json')
const isWin        = process.platform === 'win32'

function npx(...args) {
  // Windows 下始终用 npx 以绕过 PATH 问题
  return isWin
    ? spawnSync('npx', ['openclaw', ...args], { shell: true, timeout: 30000, stdio: 'pipe' })
    : spawnSync('openclaw', args,             { shell: false, timeout: 30000, stdio: 'pipe' })
}

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
      return JSON.parse(raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))
    }
  } catch {}
  return {}
}

/** 写入正确格式的 openclaw.json */
function writeCorrectConfig(apiKey, baseUrl) {
  fs.mkdirSync(OPENCLAW_DIR, { recursive: true })

  const token = crypto.randomBytes(24).toString('hex')

  const config = {
    agents: {
      defaults: {
        model: { primary: 'anthropic/claude-sonnet-4-6' }
      }
    },
    gateway: {
      mode: 'local',
      port: 18789,
      bind: 'loopback',
      auth: { mode: 'token', token }
    },
    // env 供 SDK 自动读取（兜底）
    env: {
      ANTHROPIC_API_KEY:  apiKey,
      ANTHROPIC_BASE_URL: baseUrl,
    }
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')

  // openclaw 从 agents/main/agent/auth-profiles.json 读 API key
  // 必须写入这个文件，否则报 "No API key found for provider anthropic"
  const authDir = path.join(OPENCLAW_DIR, 'agents', 'main', 'agent')
  fs.mkdirSync(authDir, { recursive: true })
  const authProfiles = {
    profiles: {
      holysheep: {
        provider: 'anthropic',
        key:      apiKey,
        baseUrl:  baseUrl,
      }
    },
    default: 'holysheep'
  }
  fs.writeFileSync(
    path.join(authDir, 'auth-profiles.json'),
    JSON.stringify(authProfiles, null, 2),
    'utf8'
  )

  return token
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

  configure(apiKey, baseUrlAnthropicNoV1) {
    const chalk = require('chalk')
    console.log(chalk.gray('\n  ⚙️  正在配置 OpenClaw...'))

    // 1. 写入正确格式配置
    writeCorrectConfig(apiKey, baseUrlAnthropicNoV1)

    // 2. doctor --fix 修复任何兼容性问题
    npx('doctor', '--fix')

    // 读取写入的 token（用于生成带 token 的直接访问 URL）
    let savedToken = ''
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      savedToken = cfg?.gateway?.auth?.token || ''
    } catch {}

    // 3. 启动 Gateway
    console.log(chalk.gray('  → 正在启动 Gateway...'))
    const ok = _startGateway()

    if (ok) {
      console.log(chalk.green('  ✓ OpenClaw Gateway 已启动'))
    } else {
      console.log(chalk.yellow('  ⚠️  Gateway 正在启动，请稍等几秒...'))
    }

    // 打印带 token 的直接访问 URL（无需手动填 token）
    const dashUrl = savedToken
      ? `http://127.0.0.1:18789/?token=${savedToken}`
      : 'http://127.0.0.1:18789/'
    console.log(chalk.cyan(`\n  → 浏览器打开（已含 token，直接可用）:`))
    console.log(chalk.bold.cyan(`     ${dashUrl}`))

    return { file: CONFIG_FILE, hot: false, _dashUrl: dashUrl }
  },

  reset() {
    try { fs.unlinkSync(CONFIG_FILE) } catch {}
  },

  getConfigPath() { return CONFIG_FILE },
  hint: 'Gateway 已启动，打开浏览器即可使用',
  launchCmd: null,
  get launchNote() {
    // 读取 token，生成带 token 的 URL
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      const token = cfg?.gateway?.auth?.token
      if (token) return `🌐 浏览器打开（含 token）: http://127.0.0.1:18789/?token=${token}`
    } catch {}
    return '🌐 打开浏览器: http://127.0.0.1:18789/'
  },
  installCmd: 'npm install -g openclaw@latest',
  docsUrl:    'https://docs.openclaw.ai',
}

/**
 * 启动 Gateway 后台进程
 * Windows: PowerShell Start-Process 开新的隐藏 PowerShell 窗口
 * Unix: detached child process
 */
function _startGateway() {
  if (isWin) {
    // Windows: 用 shell:true + start 弹出新窗口运行 gateway
    spawnSync('cmd /c start cmd /k "npx openclaw gateway --port 18789"', [], {
      shell: true,
      timeout: 5000,
      stdio: 'ignore',
    })
  } else {
    const child = spawn('openclaw', ['gateway', '--port', '18789'], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
  }

  // 等待 gateway 启动（最多 8 秒）
  for (let i = 0; i < 8; i++) {
    const t = Date.now(); while (Date.now() - t < 1000) {}
    try {
      execSync(
        isWin
          ? 'powershell -NonInteractive -Command "try { (Invoke-WebRequest -Uri http://127.0.0.1:18789/ -TimeoutSec 1 -UseBasicParsing).StatusCode } catch { exit 1 }"'
          : 'curl -sf http://127.0.0.1:18789/ -o /dev/null --max-time 1',
        { stdio: 'ignore', timeout: 3000 }
      )
      return true  // 成功响应
    } catch {}
  }
  return false
}
