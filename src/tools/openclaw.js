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

  // 完全正确的格式，基于 openclaw 2026.3.x 实测
  const config = {
    agents: {
      defaults: {
        model: { primary: 'custom/claude-sonnet-4-6' }
      }
    },
    gateway: {
      port: 18789,
      bind: 'loopback',       // 新格式，不用 "127.0.0.1"
      auth: {
        mode:  'token',
        token,
      }
    },
    // Custom provider — OpenAI-compatible
    providers: {
      custom: {
        baseUrl,              // https://api.holysheep.ai
        apiKey,
        compatibility: 'anthropic',
      }
    }
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
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

    // 3. 启动 Gateway
    console.log(chalk.gray('  → 正在启动 Gateway...'))
    const ok = _startGateway()

    if (ok) {
      console.log(chalk.green('  ✓ OpenClaw Gateway 已启动'))
      console.log(chalk.cyan('  → 浏览器打开: http://127.0.0.1:18789/'))
    } else {
      console.log(chalk.yellow('  ⚠️  请手动启动 Gateway：'))
      console.log(chalk.cyan(isWin ? '  npx openclaw gateway' : '  openclaw gateway'))
    }

    return { file: CONFIG_FILE, hot: false }
  },

  reset() {
    try { fs.unlinkSync(CONFIG_FILE) } catch {}
  },

  getConfigPath() { return CONFIG_FILE },
  hint: 'Gateway 已启动，打开浏览器即可使用',
  launchCmd: null,
  get launchNote() {
    return isWin
      ? '🌐 打开浏览器: http://127.0.0.1:18789/\n    如无法访问: npx openclaw gateway'
      : '🌐 打开浏览器: http://127.0.0.1:18789/'
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
    // Windows: 用 WScript.Shell 后台静默运行，不弹窗口，最可靠
    const vbs = `
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c npx openclaw gateway --port 18789", 0, False
`.trim()
    const vbsPath = path.join(os.tmpdir(), 'openclaw-gateway.vbs')
    try {
      fs.writeFileSync(vbsPath, vbs, 'utf8')
      spawnSync('wscript', [vbsPath], { shell: false, timeout: 5000, stdio: 'ignore' })
    } catch {}
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
