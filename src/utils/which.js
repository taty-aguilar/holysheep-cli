/**
 * 跨平台检测命令是否存在
 * Windows 用 where，Unix 用 which，兜底用 --version
 */
const { execSync } = require('child_process')

function commandExists(cmd) {
  const finder = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`
  try {
    execSync(finder, { stdio: 'ignore' })
    return true
  } catch {
    // 兜底：直接跑 --version
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 3000 })
      return true
    } catch { return false }
  }
}

module.exports = { commandExists }
