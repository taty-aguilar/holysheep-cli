/**
 * 本地配置管理 — 存储 API Key 和用户偏好
 * 配置文件: ~/.holysheep/config.json
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const CONFIG_DIR = path.join(os.homedir(), '.holysheep')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const BASE_URL_ANTHROPIC = 'https://api.holysheep.ai'         // 不带 /v1 (Anthropic SDK)
const BASE_URL_OPENAI    = 'https://api.holysheep.ai/v1'      // 带 /v1 (OpenAI 兼容)
const SHOP_URL           = 'https://holysheep.ai'

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    }
  } catch {}
  return {}
}

function saveConfig(data) {
  ensureDir()
  const current = loadConfig()
  const merged = { ...current, ...data }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2))
  return merged
}

function getApiKey() {
  return loadConfig().apiKey || process.env.HOLYSHEEP_API_KEY || ''
}

module.exports = {
  CONFIG_DIR,
  CONFIG_FILE,
  BASE_URL_ANTHROPIC,
  BASE_URL_OPENAI,
  SHOP_URL,
  loadConfig,
  saveConfig,
  getApiKey,
}
