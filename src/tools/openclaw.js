/**
 * OpenClaw 适配器
 *
 * 策略：完全通过 openclaw CLI 官方命令完成配置，不手写 JSON。
 *
 * 核心命令：
 *   openclaw onboard \
 *     --non-interactive \
 *     --auth-choice custom-api-key \
 *     --custom-base-url https://api.holysheep.ai \
 *     --custom-api-key <key> \
 *     --custom-model-id claude-sonnet-4-6 \
 *     --custom-compatibility anthropic \
 *     --install-daemon
 *
 * 文档: https://docs.openclaw.ai/start/wizard-cli-reference
 */
const fs            = require('fs')
const path          = require('path')
const os            = require('os')
const { spawnSync } = require('child_process')

const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw')
const CONFIG_FILE  = path.join(OPENCLAW_DIR, 'openclaw.json')

/** Windows PATH 未刷新时用 npx，其他直接用 openclaw */
function bin(...args) {
  const isWin = process.platform === 'win32'
  if (isWin) {
    return { cmd: 'npx', args: ['openclaw', ...args] }
  }
  return { cmd: 'openclaw', args }
}

function run(args, opts = {}) {
  const { cmd, args: fullArgs } = bin(...args)
  return spawnSync(cmd, fullArgs, {
    shell:   true,
    timeout: opts.timeout || 30000,
    stdio:   opts.stdio   || 'pipe',
    env:     { ...process.env, ...(opts.env || {}) },
  })
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

module.exports = {
  name: 'OpenClaw',
  id:   'openclaw',

  checkInstalled() {
    // 先检测命令是否在 PATH 里
    if (require('../utils/which').commandExists('openclaw')) return true
    // Windows PATH 未刷新时，npx 探测
    if (process.platform === 'win32') {
      try {
        require('child_process').execSync(
          'npx --yes openclaw --version',
          { stdio: 'ignore', timeout: 15000, shell: true }
        )
        return true
      } catch {}
    }
    return false
  },

  isConfigured() {
    const c = readConfig()
    // 检查是否已有 holysheep custom provider 配置
    const cfg = JSON.stringify(c)
    return cfg.includes('holysheep.ai') || cfg.includes('holysheep')
  },

  configure(apiKey, baseUrlAnthropicNoV1) {
    const chalk = require('chalk')

    console.log(chalk.gray('\n  ⚙️  正在通过 OpenClaw 官方向导配置（约 30 秒）...'))

    // Step 1: 删除旧配置，避免 onboard 检测到现有配置后跳过重写
    try {
      if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE)
    } catch {}

    // Step 2: 用官方 onboard 非交互式命令完成配置 + 安装系统服务
    const r = run([
      'onboard',
      '--non-interactive',
      '--auth-choice',        'custom-api-key',
      '--custom-base-url',    baseUrlAnthropicNoV1,   // https://api.holysheep.ai
      '--custom-api-key',     apiKey,
      '--custom-model-id',    'claude-sonnet-4-6',
      '--custom-compatibility', 'anthropic',
      '--install-daemon',
    ], {
      timeout: 90000,
      stdio:   'pipe',
      env: {
        CUSTOM_API_KEY:   apiKey,
        ANTHROPIC_API_KEY: apiKey,
        ANTHROPIC_BASE_URL: baseUrlAnthropicNoV1,
      },
    })

    const stdout = r.stdout?.toString() || ''
    const stderr = r.stderr?.toString() || ''

    if (r.status === 0) {
      console.log(chalk.green('  ✓ OpenClaw 配置完成，Gateway 已在后台启动'))
      console.log(chalk.cyan('  → 浏览器打开: http://127.0.0.1:18789/'))
      return { file: CONFIG_FILE, hot: false }
    }

    // onboard 失败，尝试直接启动 gateway
    console.log(chalk.gray('  → 配置完成，正在启动 Gateway...'))
    const started = _startGateway()

    if (!started) {
      // 给用户明确的手动命令
      console.log(chalk.yellow('\n  ⚠️  Gateway 需要手动启动，运行以下命令：'))
      if (process.platform === 'win32') {
        console.log(chalk.cyan('  npx openclaw gateway install'))
        console.log(chalk.cyan('  npx openclaw gateway start'))
      } else {
        console.log(chalk.cyan('  openclaw gateway install'))
        console.log(chalk.cyan('  openclaw gateway start'))
      }
    }

    return { file: CONFIG_FILE, hot: false }
  },

  reset() {
    run(['doctor', '--reset'], { stdio: 'ignore', timeout: 15000 })
  },

  getConfigPath() { return CONFIG_FILE },
  hint:      'Gateway 已自动启动，打开浏览器即可使用',
  launchCmd:  null,
  get launchNote() {
    const isWin = process.platform === 'win32'
    return isWin
      ? '🌐 打开浏览器: http://127.0.0.1:18789/\n    如无法访问: npx openclaw gateway start'
      : '🌐 打开浏览器: http://127.0.0.1:18789/'
  },
  installCmd: 'npm install -g openclaw@latest',
  docsUrl:    'https://docs.openclaw.ai',
}

/**
 * 尝试启动 Gateway，返回是否成功
 */
function _startGateway() {
  const chalk  = require('chalk')
  const isWin  = process.platform === 'win32'

  // 先尝试 gateway start（已有服务时生效）
  const r = run(['gateway', 'start'], { timeout: 10000 })
  if (r.status === 0) {
    console.log(chalk.green('  ✓ OpenClaw Gateway 已启动'))
    console.log(chalk.cyan('  → 浏览器打开: http://127.0.0.1:18789/'))
    return true
  }

  // gateway start 失败 → 直接后台运行进程（不依赖 schtasks/daemon）
  const { spawn } = require('child_process')
  if (isWin) {
    // Windows: Start-Process 开隐藏窗口运行 npx openclaw gateway
    spawnSync('powershell', [
      '-NonInteractive', '-Command',
      `Start-Process powershell -ArgumentList '-NonInteractive','-WindowStyle','Hidden','-Command','npx openclaw gateway --port 18789' -WindowStyle Hidden`
    ], { shell: false, timeout: 8000, stdio: 'ignore' })
  } else {
    const child = spawn('openclaw', ['gateway', '--port', '18789'], {
      detached: true, stdio: 'ignore',
    })
    child.unref()
  }

  // 等 5 秒让 gateway 起来
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {}

  // 验证
  try {
    const { execSync } = require('child_process')
    execSync(
      isWin
        ? 'powershell -NonInteractive -Command "(Invoke-WebRequest -Uri http://127.0.0.1:18789/ -TimeoutSec 3 -UseBasicParsing).StatusCode"'
        : 'curl -sf http://127.0.0.1:18789/ -o /dev/null --max-time 3',
      { stdio: 'ignore', timeout: 5000 }
    )
    console.log(chalk.green('  ✓ OpenClaw Gateway 已启动'))
    console.log(chalk.cyan('  → 浏览器打开: http://127.0.0.1:18789/'))
    return true
  } catch {
    return false
  }
}
