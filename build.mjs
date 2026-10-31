// Build a DSH plugin market index (format 1) from the awesome-dsh-plugin catalog.
// Keeps only plugins that have at least one version installable on DSH_VERSION.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import semver from 'semver'
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

const DSH_VERSION = process.env.DSH_VERSION || '0.2.1-rc.5'
const UPSTREAM = process.env.UPSTREAM_INDEX || 'https://awesome-dsh-plugin.com/index.json'
const INDEX_URL = 'https://aaamechanic.github.io/dsh-plugin-market/index.json'
const MAX_VERSIONS_PER_PLUGIN = 3
const HERE = dirname(fileURLToPath(import.meta.url))
// The published index truncates every description to 160 characters; the full
// text lives in the catalog repository's data/plugins/*.yml. Read a local clone
// of that repository (sparse checkout of data/plugins) when it is present, so
// the market can show a complete introduction instead of an ellipsised one.
const UPSTREAM_DATA_DIR =
  process.env.UPSTREAM_DATA_DIR || join(HERE, '..', 'awesome-dsh-plugin', 'data', 'plugins')

const response = await fetch(UPSTREAM)
if (!response.ok) throw new Error(`upstream ${response.status} ${response.statusText}`)
const upstream = await response.json()
if (upstream.format !== 1 || !Array.isArray(upstream.plugins)) throw new Error('unexpected upstream format')

/** Full, untruncated descriptions keyed by the catalog's `owner/repo` name. */
const fullDescriptions = new Map()
if (existsSync(UPSTREAM_DATA_DIR)) {
  for (const file of readdirSync(UPSTREAM_DATA_DIR)) {
    if (!file.endsWith('.yml')) continue
    try {
      const entry = parseYaml(readFileSync(join(UPSTREAM_DATA_DIR, file), 'utf8'))
      if (entry && typeof entry.name === 'string' && entry.description !== undefined) {
        fullDescriptions.set(entry.name, entry.description)
      }
    } catch {
      // A malformed catalog file only costs that plugin its full description.
    }
  }
} else {
  console.warn(`full descriptions unavailable: ${UPSTREAM_DATA_DIR} is missing`)
}

/** GitHub stars and 30-day npm downloads, keyed by repository URL. */
function loadStats(file) {
  try {
    return JSON.parse(readFileSync(join(UPSTREAM_DATA_DIR, '..', file), 'utf8'))
  } catch {
    return {}
  }
}
const starsByRepo = loadStats('stars.json')
const downloadsByRepo = loadStats('downloads.json')

/** Read one popularity statistic for an entry, tolerating monorepo tree paths. */
function readStat(map, repository) {
  if (!repository || typeof repository.url !== 'string') return 0
  const valueOf = (hit) => {
    if (hit === undefined) return 0
    if (typeof hit === 'number') return Number.isFinite(hit) ? hit : 0
    const value = hit.stars ?? hit.downloads ?? 0
    return Number.isFinite(value) ? value : 0
  }
  const exact = map[repository.url]
  if (exact !== undefined) return valueOf(exact)
  if (typeof repository.directory === 'string' && repository.directory !== '') {
    const prefix = `${repository.url}/tree/`
    for (const [key, hit] of Object.entries(map)) {
      if (key.startsWith(prefix) && key.endsWith(`/${repository.directory}`)) return valueOf(hit)
    }
  }
  return 0
}

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
const popularity = new Map()
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
  // Prefer the catalog's full description; the published index keeps only the
  // first 160 characters of it.
  const full = fullDescriptions.get(plugin.title) ?? fullDescriptions.get(plugin.name)
  const description = localized(full) ?? localized(plugin.description)
  const repository = text(plugin.repository?.url) ? plugin.repository : undefined
  popularity.set(plugin.name, {
    stars: readStat(starsByRepo, repository),
    downloads: readStat(downloadsByRepo, repository),
  })
  plugins.push({
    name: plugin.name,
    ...(text(plugin.title) ? { title: plugin.title } : {}),
    ...(description === undefined ? {} : { description }),
    ...(text(plugin.icon) ? { icon: plugin.icon } : {}),
    ...(text(plugin.author) ? { author: plugin.author } : {}),
    ...(text(plugin.homepage) ? { homepage: plugin.homepage } : {}),
    ...(repository ? { repository } : {}),
    metadata: {
      ...(plugin.metadata?.category ? { category: plugin.metadata.category } : {}),
      keywords: plugin.metadata?.keywords ?? [],
      // Only rating labels are declared in this index; upstream labels are not.
      labels: [],
      sortKeys: { updated: Math.max(...versions.map((v) => v.publishTimestamp)) },
    },
    versions,
  })
}

// Rating is a 0.0–5.0 heat score from public signals: GitHub stars (65%) and
// 30-day npm downloads (35%), log-normalized against the catalog maximum. The
// default order mixes it with publish recency — 50% rating, 50% recency with a
// 60-day half-life — so a popular but older plugin still outranks an unknown
// brand-new one, and neither factor alone decides.
const logNorm = (value, max) => Math.log10(1 + value) / Math.log10(1 + max)
const maxStars = Math.max(1, ...[...popularity.values()].map((entry) => entry.stars))
const maxDownloads = Math.max(1, ...[...popularity.values()].map((entry) => entry.downloads))
const nowSeconds = Math.floor(Date.now() / 1000)
const composite = new Map()
const usedLabels = new Map()
for (const plugin of plugins) {
  const { stars, downloads } = popularity.get(plugin.name)
  const raw = 5 * (0.65 * logNorm(stars, maxStars) + 0.35 * logNorm(downloads, maxDownloads))
  const rating = Math.round(raw * 10) / 10
  const ageDays = Math.max(0, (nowSeconds - plugin.metadata.sortKeys.updated) / 86400)
  const recency = Math.exp(-ageDays / 60)
  composite.set(plugin, 0.5 * recency + 0.5 * (rating / 5))
  plugin.metadata.sortKeys.rating = rating
  plugin.metadata.sortKeys.stars = stars
  plugin.metadata.sortKeys.downloads = downloads
  const band = Math.round(rating * 2) / 2
  if (band >= 0.5) {
    const id = `rating-${band.toFixed(1)}`
    usedLabels.set(id, band)
    plugin.metadata.labels = [id]
  }
}

plugins.sort(
  (left, right) =>
    composite.get(right) - composite.get(left) ||
    right.metadata.sortKeys.updated - left.metadata.sortKeys.updated,
)

const usedCategories = new Set(plugins.map((p) => p.metadata.category).filter(Boolean))
const categories = {}
for (const [id, declaration] of Object.entries(upstream.metadata?.categories ?? {})) {
  if (usedCategories.has(id)) categories[id] = declaration
}

const labels = {}
for (const [id, band] of [...usedLabels].sort((left, right) => left[1] - right[1])) {
  labels[id] = { title: { en: `★ ${band.toFixed(1)}`, zh: `★ ${band.toFixed(1)}` } }
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
    labels,
    sortKeys: {
      updated: { title: { en: 'Last updated', zh: '最近更新' }, order: 'desc' },
      rating: { title: { en: 'Rating', zh: '评分' }, order: 'desc' },
      stars: { title: { en: 'GitHub stars', zh: 'GitHub 星标' }, order: 'desc' },
      downloads: { title: { en: 'Downloads (30d)', zh: '30 天下载' }, order: 'desc' },
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
      fullDescriptions: fullDescriptions.size,
      droppedIncompatible,
      droppedVersions,
      bytes: json.length,
    },
    null,
    2,
  ),
)
