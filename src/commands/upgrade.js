/**
 * hs upgrade — 自动升级 AI 编程工具到最新版本
 */
const chalk = require('chalk')
const { execSync } = require('child_process')
const { commandExists } = require('../utils/which')

// 支持升级的工具列表
const UPGRADABLE_TOOLS = [
  {
    name: 'Claude Code',
    id: 'claude-code',
    command: 'claude',
    versionCmd: 'claude --version',
    npmPkg: '@anthropic-ai/claude-code',
    installCmd: 'npm install -g @anthropic-ai/claude-code@latest',
  },
  {
    name: 'Codex CLI',
    id: 'codex',
    command: 'codex',
    versionCmd: 'codex --version',
    npmPkg: '@openai/codex',
    installCmd: 'npm install -g @openai/codex@latest',
  },
  {
    name: 'Gemini CLI',
    id: 'gemini-cli',
    command: 'gemini',
    versionCmd: 'gemini --version',
    npmPkg: '@google/gemini-cli',
    installCmd: 'npm install -g @google/gemini-cli@latest',
  },
]

/**
 * 获取本地已安装版本
 */
function getLocalVersion(tool) {
  try {
    const output = execSync(tool.versionCmd, { stdio: 'pipe', timeout: 10000 })
      .toString().trim()
    // 提取版本号（匹配 x.y.z 格式）
    const match = output.match(/(\d+\.\d+\.\d+[\w.-]*)/)
    return match ? match[1] : output.split('\n')[0].slice(0, 30)
  } catch {
    return null
  }
}

/**
 * 从 npm registry 获取最新版本
 */
async function getLatestVersion(npmPkg) {
  try {
    const https = require('https')
    return new Promise((resolve) => {
      const req = https.get(
        `https://registry.npmjs.org/${npmPkg}/latest`,
        { timeout: 8000 },
        (res) => {
          let data = ''
          res.on('data', chunk => { data += chunk })
          res.on('end', () => {
            try {
              resolve(JSON.parse(data).version || null)
            } catch { resolve(null) }
          })
        }
      )
      req.on('error', () => resolve(null))
      req.setTimeout(8000, () => { req.destroy(); resolve(null) })
    })
  } catch {
    return null
  }
}

/**
 * 执行升级
 */
function runUpgrade(tool) {
  try {
    console.log(chalk.gray(`  运行: ${tool.installCmd}`))
    execSync(tool.installCmd, { stdio: 'inherit', timeout: 120000 })
    return true
  } catch (e) {
    console.log(chalk.red(`  ✗ 升级失败: ${e.message}`))
    return false
  }
}

async function upgrade() {
  console.log()
  console.log(chalk.bold('🔄  HolySheep Upgrade — 升级 AI 编程工具'))
  console.log(chalk.gray('━'.repeat(50)))
  console.log()

  let hasInstalled = false
  let upgraded = 0
  let alreadyLatest = 0

  for (const tool of UPGRADABLE_TOOLS) {
    const installed = commandExists(tool.command)

    if (!installed) {
      console.log(`  ${chalk.gray('○')} ${chalk.gray(tool.name.padEnd(18))} ${chalk.gray('未安装')} ${chalk.gray(`— ${tool.installCmd}`)}`)
      continue
    }

    hasInstalled = true
    const localVer = getLocalVersion(tool)
    process.stdout.write(`  ${chalk.cyan('◌')} ${tool.name.padEnd(18)} ${chalk.gray('v' + (localVer || '?'))} → 检查最新版本...`)

    const latestVer = await getLatestVersion(tool.npmPkg)

    if (!latestVer) {
      console.log(chalk.yellow(' 无法获取最新版本'))
      continue
    }

    if (localVer === latestVer) {
      // 用 \r 覆盖当前行
      console.log(`\r  ${chalk.green('✓')} ${chalk.green(tool.name.padEnd(18))} ${chalk.gray('v' + localVer)} ${chalk.green('已是最新版本')}        `)
      alreadyLatest++
      continue
    }

    console.log(`\r  ${chalk.yellow('↑')} ${chalk.yellow(tool.name.padEnd(18))} ${chalk.gray('v' + (localVer || '?'))} → ${chalk.cyan('v' + latestVer)}        `)

    const success = runUpgrade(tool)
    if (success) {
      const newVer = getLocalVersion(tool)
      console.log(`  ${chalk.green('✓')} ${chalk.green(tool.name)} 升级成功 → ${chalk.cyan('v' + (newVer || latestVer))}`)
      upgraded++
    }
    console.log()
  }

  // 总结
  console.log()
  if (!hasInstalled) {
    console.log(chalk.yellow('没有检测到已安装的 AI 编程工具。'))
    console.log(chalk.gray('支持的工具: Claude Code, Codex CLI, Gemini CLI'))
    console.log(chalk.gray('安装示例: npm install -g @anthropic-ai/claude-code'))
  } else if (upgraded > 0) {
    console.log(chalk.green(`✓ 升级了 ${upgraded} 个工具`))
  } else if (alreadyLatest > 0) {
    console.log(chalk.green('✓ 所有工具已是最新版本'))
  }
  console.log()
}

module.exports = upgrade
