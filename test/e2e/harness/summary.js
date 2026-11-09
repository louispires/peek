// Writes pass, fail and skip counts from the Playwright junit file, plus the names of failed tests,
// to the GitHub step summary (or to stdout when run by hand). Exits 1 when no test result exists.
const fs = require('fs')
const path = require('path')

const file = process.argv[2] || path.join(__dirname, '..', 'results', 'junit.xml')

function decode(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function attr(tag, name) {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)
  return m ? decode(m[1]) : ''
}

function parseCases(xml) {
  const cases = []
  const pattern = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g
  for (let m = pattern.exec(xml); m; m = pattern.exec(xml)) {
    const inner = m[3] || ''
    const status = /<(failure|error)\b/.test(inner) ? 'failed' : /<skipped\b/.test(inner) ? 'skipped' : 'passed'
    cases.push({ name: `${attr(m[1], 'classname')} > ${attr(m[1], 'name')}`, status })
  }
  return cases
}

function render(cases) {
  const count = (status) => cases.filter(c => c.status === status).length
  const lines = [
    '## macOS end-to-end results',
    '',
    '| Passed | Failed | Skipped |',
    '| --- | --- | --- |',
    `| ${count('passed')} | ${count('failed')} | ${count('skipped')} |`
  ]
  const failed = cases.filter(c => c.status === 'failed')
  if (failed.length) {
    lines.push('', '### Failed tests', '', ...failed.map(c => `- ${c.name}`))
  }
  return lines.join('\n') + '\n'
}

function main() {
  let cases = []
  if (fs.existsSync(file)) cases = parseCases(fs.readFileSync(file, 'utf8'))
  const text = cases.length ? render(cases) : `## macOS end-to-end results\n\nNo test results found in ${file}.\n`
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text)
  else process.stdout.write(text)
  process.exit(cases.length ? 0 : 1)
}

if (require.main === module) main()

module.exports = { parseCases, render }
