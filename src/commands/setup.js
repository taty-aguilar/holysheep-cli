/**
 * hs setup — 一键配置所有 AI 工具接入 HolySheep API
 */
const inquirer  = require('inquirer')
const chalk     = require('chalk')
const ora       = require('ora')
const { execSync, spawnSync } = require('child_process')
const { saveConfig, getApiKey, BASE_URL_ANTHROPIC, BASE_URL_OPENAI, SHOP_URL } = require('../utils/config')
const { writeEnvToShell } = require('../utils/shell')
const TOOLS = require('../tools')

// 工具的自动安装命令（npm/pip）
const AUTO_INSTALL = {
  'claude-code': { cmd: 'npm install -g @anthropic-ai/claude-code', mgr: 'npm' },
  'codex':       { cmd: 'npm install -g @openai/codex',             mgr: 'npm' },
  'gemini-cli':  { cmd: 'npm install -g @google/gemini-cli',        mgr: 'npm' },
  'opencode':    { cmd: 'npm install -g opencode-ai',               mgr: 'npm' },
  'openclaw':    { cmd: 'npm install -g openclaw@latest --ignore-scripts', mgr: 'npm' },
  'aider':       { cmd: 'pip install aider-chat',                   mgr: 'pip' },
}

function canAutoInstall(toolId) {
  return !!AUTO_INSTALL[toolId]
}

async function tryAutoInstall(tool) {
  const info = AUTO_INSTALL[tool.id]
  if (!info) return false

  // 检查 npm/pip 是否可用
  try {
    execSync(`${info.mgr} --version`, { stdio: 'ignore' })
  } catch {
    console.log(chalk.red(`  ✗ 未找到 ${info.mgr}，无法自动安装 ${tool.name}`))
    return false
  }

  const spinner = ora(`正在安装 ${tool.name}...`).start()
  try {
    const ret = spawnSync(info.cmd.split(' ')[0], info.cmd.split(' ').slice(1), {
      stdio: 'inherit',
      shell: true,
    })
    if (ret.status !== 0) {
      spinner.fail(`安装失败，请手动运行: ${chalk.cyan(info.cmd)}`)
      return false
    }
    spinner.succeed(`${tool.name} 安装成功`)
    // Windows PATH 在当前进程内不会刷新，但安装已成功，直接继续配置
    // 非 Windows 再额外做一次检测
    if (process.platform !== 'win32' && !tool.checkInstalled()) {
      console.log(chalk.yellow(`  ⚠ 安装后未检测到命令，尝试直接配置...`))
    }
    if (process.platform === 'win32') {
      tool._winJustInstalled = true  // 标记为 Windows 刚装的，摘要里特殊处理
    }
    return true  // 安装成功就视为可配置
  } catch (e) {
    spinner.fail(`安装失败: ${e.message}`)
    return false
  }
}

async function setup(options) {
  console.log()
  console.log(chalk.bold('🐑  HolySheep CLI — 一键配置 AI 工具'))
  console.log(chalk.gray('━'.repeat(50)))
  console.log()

  // Step 1: 获取 API Key
  let apiKey = options.key || getApiKey()

  if (!apiKey) {
    console.log(chalk.yellow('需要 API Key 才能配置工具。'))
    console.log(chalk.cyan(`还没有账号？前往注册：${SHOP_URL}`))
    console.log(chalk.gray(`提示：可先运行 ${chalk.cyan('hs login')} 登录并保存 Key，之后 setup 将自动读取。`))
    if (process.platform === 'win32') {
      console.log(chalk.gray(`  ⚠️  Windows 用户：如果 ${chalk.cyan('hs')} 命令找不到，请用以下方式运行：`))
      console.log(chalk.gray(`     ${chalk.white('npx @simonyea/holysheep-cli login')}  （无需安装，直接用）`))
      console.log(chalk.gray(`     或重启终端后再试`))
    }
    console.log()

    const { key } = await inquirer.prompt([{
      type: 'password',
      name: 'key',
      message: 'API Key (cr_xxx):',
      validate: v => v.startsWith('cr_') ? true : '请输入以 cr_ 开头的 API Key',
    }])
    apiKey = key
  } else {
    console.log(`${chalk.green('✓')} 已保存的 API Key: ${chalk.cyan(maskKey(apiKey))}`)
    const { useExisting } = await inquirer.prompt([{
      type: 'confirm',
      name: 'useExisting',
      message: '使用此 Key 继续？（输入 N 可更换）',
      default: true,
    }])
    if (!useExisting) {
      const { key } = await inquirer.prompt([{
        type: 'password',
        name: 'key',
        message: '请输入新的 API Key (cr_xxx):',
        validate: v => v.startsWith('cr_') ? true : '请输入以 cr_ 开头的 API Key',
      }])
      apiKey = key
      saveConfig({ apiKey: key })
    }
  }

  // Step 1.5: 选择要配置的模型
  const MODEL_CHOICES = [
    { name: 'claude-sonnet-4-6  (Sonnet 4.6, 均衡推荐)', value: 'claude-sonnet-4-6',       checked: true },
    { name: 'claude-opus-4-6    (Opus 4.6, 强力旗舰)',   value: 'claude-opus-4-6',         checked: true },
    { name: 'MiniMax-M2.5-highspeed (高速经济版)',        value: 'MiniMax-M2.5-highspeed',  checked: true },
  ]
  const { selectedModels } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selectedModels',
    message: '选择要配置的模型（默认全选，空格取消选中）:',
    choices: MODEL_CHOICES,
    pageSize: 5,
  }])
  const primaryModel = selectedModels.find(m => m.startsWith('claude-')) || selectedModels[0] || 'claude-sonnet-4-6'

  // Step 2: 选择工具（已安装 + 未安装分组显示）
  const installedTools   = TOOLS.filter(t => t.checkInstalled())
  const uninstalledTools = TOOLS.filter(t => !t.checkInstalled())

  const choices = []
  if (installedTools.length) {
    choices.push(new inquirer.Separator(chalk.green('── 已安装 ──')))
    installedTools.forEach(t => choices.push({
      name: `${chalk.green('●')}  ${t.name.padEnd(18)} ${chalk.gray('(已安装)')}`,
      value: t.id,
      short: t.name,
      checked: true,  // 已安装的默认全选
    }))
  }
  if (uninstalledTools.length) {
    choices.push(new inquirer.Separator(chalk.gray('── 未安装（可自动安装）──')))
    uninstalledTools.forEach(t => choices.push({
      name: `${chalk.gray('○')}  ${t.name.padEnd(18)} ${canAutoInstall(t.id) ? chalk.cyan('(选中后自动安装)') : chalk.gray('(需手动安装)')}`,
      value: t.id,
      short: t.name,
      checked: false,
    }))
  }

  const { toolIds } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'toolIds',
    message: '选择要配置的工具（空格选中，回车确认）:',
    choices,
    pageSize: 14,
  }])

  if (toolIds.length === 0) {
    console.log(chalk.yellow('\n未选择任何工具，退出。'))
    return
  }

  console.log()

  // Step 3: 对未安装但被选中的工具，询问是否自动安装
  const selectedTools = TOOLS.filter(t => toolIds.includes(t.id))
  const needInstall = selectedTools.filter(t => !t.checkInstalled() && canAutoInstall(t.id))
  const cantInstall = selectedTools.filter(t => !t.checkInstalled() && !canAutoInstall(t.id))
  const justInstalled = new Set()  // 记录本次刚安装成功的工具 id

  // 提示不能自动安装的工具
  if (cantInstall.length) {
    console.log(chalk.yellow(`以下工具需要手动安装后再运行 hs setup：`))
    cantInstall.forEach(t => console.log(`  ${chalk.gray('→')} ${t.name}: ${chalk.cyan(t.installCmd)}`))
    console.log()
  }

  // 自动安装可以安装的工具
  if (needInstall.length) {
    const { doInstall } = await inquirer.prompt([{
      type: 'confirm',
      name: 'doInstall',
      message: `检测到 ${needInstall.map(t => chalk.cyan(t.name)).join('、')} 未安装，现在自动安装？`,
      default: true,
    }])

    if (doInstall) {
      for (const tool of needInstall) {
        const ok = await tryAutoInstall(tool)
        if (ok) {
          justInstalled.add(tool.id)
        } else if (tool.id === 'openclaw') {
          // openclaw 安装失败时（如无 git），改用 npx 模式继续配置
          // checkInstalled() 里已有 npx fallback，标记为已安装
          console.log(chalk.yellow(`  ⚠️  全局安装失败，将使用 npx openclaw 代替`))
          tool._useNpx = true
          justInstalled.add(tool.id)
        }
      }
      console.log()
    }
  }

  // Step 4: 配置每个已安装的工具（包含刚刚安装成功的）
  const envVarsToWrite = {}
  const results = []
  const toConfigureTools = selectedTools.filter(t => t.checkInstalled() || justInstalled.has(t.id))

  if (toConfigureTools.length === 0) {
    console.log(chalk.yellow('没有可配置的工具（请先安装），退出。'))
    return
  }

  for (const tool of toConfigureTools) {
    const spinner = ora(`配置 ${tool.name}...`).start()
    try {
      const result = tool.configure(apiKey, BASE_URL_ANTHROPIC, BASE_URL_OPENAI, primaryModel, selectedModels)

      if (result.manual) {
        spinner.info(`${chalk.yellow(tool.name)} 需要手动配置:`)
        result.steps.forEach((s, i) => console.log(`  ${chalk.gray(i + 1 + '.')} ${s}`))
        results.push({ tool, status: 'manual' })
      } else if (result.warning) {
        if (result.envVars) Object.assign(envVarsToWrite, result.envVars)
        spinner.warn(`${chalk.yellow(tool.name)} ${chalk.gray(result.file ? `→ ${result.file}` : '')}`)
        console.log(chalk.yellow(`  ⚠️  ${result.warning}`))
        results.push({ tool, status: 'warning', result })
      } else {
        if (result.envVars) Object.assign(envVarsToWrite, result.envVars)
        spinner.succeed(`${chalk.green(tool.name)} ${chalk.gray(result.file ? `→ ${result.file}` : '')}`)
        results.push({ tool, status: 'ok', result })
      }
    } catch (e) {
      spinner.fail(`${chalk.red(tool.name)}: ${e.message}`)
      results.push({ tool, status: 'error', error: e.message })
    }
  }

  // Step 5: 写入通用环境变量
  const needsEnvVars = toConfigureTools.some(t => t.id === 'codex' || t.id === 'aider')
  if (needsEnvVars || Object.keys(envVarsToWrite).length > 0) {
    Object.assign(envVarsToWrite, {
      ANTHROPIC_API_KEY: apiKey,
      ANTHROPIC_BASE_URL: BASE_URL_ANTHROPIC,
      OPENAI_API_KEY: apiKey,
      OPENAI_BASE_URL: BASE_URL_OPENAI,
    })
  }

  if (Object.keys(envVarsToWrite).length > 0) {
    const spinner = ora('写入环境变量到 shell 配置文件...').start()
    try {
      const written = writeEnvToShell(envVarsToWrite)
      spinner.succeed(`环境变量已写入: ${written.map(f => chalk.cyan(f)).join(', ')}`)
    } catch (e) {
      spinner.fail(`写入环境变量失败: ${e.message}`)
    }
  }

  // Step 6: 保存 API Key
  saveConfig({ apiKey })

  // 摘要
  console.log()
  console.log(chalk.bold('━'.repeat(50)))
  console.log(chalk.green.bold('✅ 配置完成！'))
  console.log()

  const ok     = results.filter(r => r.status === 'ok')
  const manual = results.filter(r => r.status === 'manual')
  const errors = results.filter(r => r.status === 'error')

  if (ok.length) {
    console.log(chalk.green(`已配置 ${ok.length} 个工具:`))
    ok.forEach(r => {
      const hot = r.result?.hot ? chalk.cyan(' (热切换，无需重启)') : chalk.gray(' (重启终端生效)')
      console.log(`  ✓ ${r.tool.name}${hot}`)
      if (r.tool.hint) console.log(`    ${chalk.gray('💡 ' + r.tool.hint)}`)
      // 显示启动命令
      if (r.tool.launchSteps) {
        // 多步骤启动（如 openclaw）
        console.log(`    ${chalk.gray('▶  启动步骤:')}`)
        r.tool.launchSteps.forEach((s, i) => {
          console.log(`    ${chalk.gray(`   ${i + 1}.`)} ${chalk.cyan.bold(s.cmd)}  ${chalk.gray(s.note)}`)
        })
      } else if (r.tool.launchCmd) {
        if (r.tool._winJustInstalled) {
          const cmdBin = r.tool.launchCmd.split(' ')[0]
          const cmdArgs = r.tool.launchCmd.split(' ').slice(1).join(' ')
          const npxCmd = 'npx ' + cmdBin + (cmdArgs ? ' ' + cmdArgs : '')
          console.log(`    ${chalk.gray('▶  启动命令:')} ${chalk.cyan.bold(npxCmd)}`)
        } else {
          console.log(`    ${chalk.gray('▶  启动命令:')} ${chalk.cyan.bold(r.tool.launchCmd)}`)
        }
        if (r.tool.launchNote) console.log(`    ${chalk.gray('   ' + r.tool.launchNote)}`)
      } else if (r.tool.launchNote) {
        console.log(`    ${chalk.gray('▶  ' + r.tool.launchNote)}`)
      }
    })
    console.log()
  }

  if (manual.length) {
    console.log(chalk.yellow(`${manual.length} 个工具需要手动配置（见上方步骤）`))
    console.log()
  }

  if (errors.length) {
    console.log(chalk.red(`${errors.length} 个工具配置失败:`))
    errors.forEach(r => console.log(`  ✗ ${r.tool.name}: ${r.error}`))
    console.log()
  }

  console.log(chalk.gray('如需切换其他工具，运行: hs setup'))
  console.log(chalk.gray('查看余额: hs balance'))
  console.log(chalk.gray('检查配置: hs doctor'))
  console.log()
}

function maskKey(key) {
  if (!key || key.length < 8) return '****'
  return key.slice(0, 6) + '...' + key.slice(-4)
}

module.exports = setup
