#!/usr/bin/env node
'use strict'

const { program } = require('commander')
const chalk = require('chalk')
const pkg = require('../package.json')

// Windows 用户：检测 npm bin 路径是否在 PATH 中
if (process.platform === 'win32') {
  const { execSync } = require('child_process')
  try {
    // 静默检查，只在首次遇到问题时才会走到这（因为已经能运行 node 了）
  } catch {}
}

// Banner
function printBanner() {
  console.log()
  console.log(chalk.bold('🐑  ' + chalk.hex('#e8a46a')('HolySheep CLI') + '  v' + pkg.version))
  console.log(chalk.gray('官方 Claude/GPT/Gemini API · ¥1=$1 · holysheep.ai'))
}

program
  .name('hs')
  .description('一键配置所有 AI 编程工具接入 HolySheep API')
  .version(pkg.version, '-v, --version')
  .addHelpText('before', `
🐑  HolySheep CLI v${pkg.version}
官方 Claude / GPT / Gemini API · ¥1=$1 · https://holysheep.ai

支持工具: Claude Code · Codex · Gemini CLI · OpenCode · OpenClaw · Aider · Cursor · Continue
`)

// ── login ────────────────────────────────────────────────────────────────────
program
  .command('login')
  .description('登录 HolySheep，保存 API Key 到本地')
  .action(async () => {
    const { login } = require('./commands/login')
    await login()
  })

// ── logout ───────────────────────────────────────────────────────────────────
program
  .command('logout')
  .description('退出登录，清除本地 API Key')
  .action(async () => {
    const { logout } = require('./commands/login')
    await logout()
  })

// ── whoami ───────────────────────────────────────────────────────────────────
program
  .command('whoami')
  .description('显示当前登录状态')
  .action(async () => {
    const { whoami } = require('./commands/login')
    await whoami()
  })

// ── setup ────────────────────────────────────────────────────────────────────
program
  .command('setup')
  .description('一键配置 AI 工具接入 HolySheep API')
  .option('-k, --key <apiKey>', '直接指定 API Key（跳过交互）')
  .option('-a, --all', '配置所有已安装的工具（跳过选择）')
  .action(async (opts) => {
    printBanner()
    await require('./commands/setup')(opts)
  })

// ── doctor ───────────────────────────────────────────────────────────────────
program
  .command('doctor')
  .alias('check')
  .description('检查环境配置和各工具状态')
  .action(async () => {
    await require('./commands/doctor')()
  })

// ── balance ──────────────────────────────────────────────────────────────────
program
  .command('balance')
  .alias('bal')
  .description('查看账户余额和今日用量')
  .action(async () => {
    await require('./commands/balance')()
  })

// ── reset ────────────────────────────────────────────────────────────────────
program
  .command('reset')
  .description('清除所有 HolySheep 配置，恢复默认')
  .option('-y, --yes', '跳过确认直接执行')
  .action(async (opts) => {
    await require('./commands/reset')(opts)
  })

// ── tools ────────────────────────────────────────────────────────────────────
program
  .command('tools')
  .description('列出所有支持的 AI 工具')
  .action(() => {
    const TOOLS = require('./tools')
    console.log()
    console.log(chalk.bold('支持的 AI 工具:'))
    console.log()
    TOOLS.forEach(t => {
      const installed = t.checkInstalled()
      const icon = installed ? chalk.green('●') : chalk.gray('○')
      const status = installed ? chalk.green('已安装') : chalk.gray('未安装')
      console.log(`  ${icon} ${t.name.padEnd(20)} ${status}`)
      console.log(`    ${chalk.gray('安装: ' + t.installCmd)}`)
      console.log()
    })
  })

// 默认：无命令时显示帮助 + 提示 setup
program
  .action(() => {
    printBanner()
    console.log()
    console.log(chalk.cyan('快速开始:'))
    console.log(`  ${chalk.bold('hs login')}    登录并保存 API Key`)
    console.log(`  ${chalk.bold('hs setup')}    一键配置所有 AI 工具`)
    console.log(`  ${chalk.bold('hs whoami')}   查看当前登录状态`)
    console.log(`  ${chalk.bold('hs doctor')}   检查配置状态`)
    console.log(`  ${chalk.bold('hs balance')}  查看账户余额`)
    console.log(`  ${chalk.bold('hs tools')}    查看支持的工具列表`)
    console.log()
    console.log(chalk.gray(`注册账号: https://holysheep.ai`))
    console.log()
  })

program.parse(process.argv)

// 无参数时显示默认信息
if (process.argv.length === 2) {
  program.help()
}
