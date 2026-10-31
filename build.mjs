// Build a DSH plugin market index (format 1) from the awesome-dsh-plugin catalog.
// Keeps only plugins that have at least one version installable on DSH_VERSION.
import { writeFileSync } from 'node:fs'
import semver from 'semver'
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

const DSH_VERSION = process.env.DSH_VERSION || '0.2.1-rc.5'
const UPSTREAM = process.env.UPSTREAM_INDEX || 'https://awesome-dsh-plugin.com/index.json'
const INDEX_URL = 'https://aaamechanic.github.io/dsh-plugin-market/index.json'
const MAX_VERSIONS_PER_PLUGIN = 3

const response = await fetch(UPSTREAM)
if (!response.ok) throw new Error(`upstream ${response.status} ${response.statusText}`)
const upstream = await response.json()
if (upstream.format !== 1 || !Array.isArray(upstream.plugins)) throw new Error('unexpected upstream format')

function compatible(version) {
  const range = version.engines?.dsh
  if (!range) return true
  try {
    return semver.satisfies(DSH_VERSION, range)
  } catch {
    return false
  }
}

const plugins = []
let droppedIncompatible = 0
let droppedVersions = 0
for (const plugin of upstream.plugins) {
  const versions = (plugin.versions ?? []).filter(compatible).slice(0, MAX_VERSIONS_PER_PLUGIN)
  droppedVersions += (plugin.versions ?? []).length - (plugin.versions ?? []).filter(compatible).length
  if (versions.length === 0) {
    droppedIncompatible += 1
    continue
  }
  const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value : undefined)
  // Upstream descriptions are localized ({ en, zh }); keep the whole object so the
  // market page can show a one-line Chinese intro under each plugin name.
  const localized = (value) => {
    const plain = text(value)
    if (plain !== undefined) return plain
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const entries = Object.entries(value).filter(([, member]) => text(member) !== undefined)
    if (!entries.length || text(value.en) === undefined) return undefined
    return Object.fromEntries(entries)
  }
  const description = localized(plugin.description)
  plugins.push({
    name: plugin.name,
    ...(text(plugin.title) ? { title: plugin.title } : {}),
    ...(description === undefined ? {} : { description }),
    ...(text(plugin.icon) ? { icon: plugin.icon } : {}),
    ...(text(plugin.author) ? { author: plugin.author } : {}),
    ...(text(plugin.homepage) ? { homepage: plugin.homepage } : {}),
    ...(text(plugin.repository?.url) ? { repository: plugin.repository } : {}),
    metadata: {
      ...(plugin.metadata?.category ? { category: plugin.metadata.category } : {}),
      keywords: plugin.metadata?.keywords ?? [],
      labels: plugin.metadata?.labels ?? [],
      sortKeys: { updated: Math.max(...versions.map((v) => v.publishTimestamp)) },
    },
    versions,
  })
}

plugins.sort((a, b) => b.metadata.sortKeys.updated - a.metadata.sortKeys.updated)

const usedCategories = new Set(plugins.map((p) => p.metadata.category).filter(Boolean))
const categories = {}
for (const [id, declaration] of Object.entries(upstream.metadata?.categories ?? {})) {
  if (usedCategories.has(id)) categories[id] = declaration
}

const index = {
  format: 1,
  title: { en: 'DSH Community Plugins', zh: 'DSH 社区插件市场' },
  description: {
    en: `Community-curated DeepSeek Harness plugins, filtered to versions installable on DSH ${DSH_VERSION}. Source: awesome-dsh-plugin.com (CC0).`,
    zh: `社区精选 DeepSeek Harness 插件，仅保留可在 DSH ${DSH_VERSION} 上安装的版本。来源：awesome-dsh-plugin.com（CC0）。`,
  },
  metadata: {
    categories,
    labels: {},
    sortKeys: {
      updated: { title: { en: 'Last updated', zh: '最近更新' }, order: 'desc' },
    },
  },
  plugins,
}

const validated = parseMarketIndex(index, INDEX_URL)
const json = JSON.stringify(validated)
writeFileSync(new URL('./index.json', import.meta.url), json)

console.log(
  JSON.stringify(
    {
      dshVersion: DSH_VERSION,
      upstreamPlugins: upstream.plugins.length,
      publishedPlugins: validated.plugins.length,
      droppedIncompatible,
      droppedVersions,
      bytes: json.length,
    },
    null,
    2,
  ),
)
