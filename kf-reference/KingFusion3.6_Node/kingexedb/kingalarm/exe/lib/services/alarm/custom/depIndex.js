const fs = require("fs"),
  TAG_RE = /\$Alarm\.(\$?[A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)/g

function extractDeps (s, e = []) {
  const r = new Set(e || [])
  let t
  for (;
    (t = TAG_RE.exec(s)) !== null;) r.add(t[1])
  return Array.from(r)
}

function buildDepIndex (s) {
  const e = new Map
  for (const r of s)
    for (const t of r.deps) e.has(t) || e.set(t, new Set), e.get(t).add(r.id)
  return e
}

function addDepsToItems (s) {
  return s.map(e => {
    try {
      const r = fs.readFileSync(e.scriptPath, "utf8"),
        t = extractDeps(r, e.raw.deps || [])
      return {
        ...e,
        deps: t,
        scriptSource: r
      }
    } catch (r) {
      return console.warn(`\u8BFB\u53D6\u811A\u672C\u6587\u4EF6\u5931\u8D25 [${e.id}]:`, r.message), {
        ...e,
        deps: e.raw.deps || [],
        scriptSource: ""
      }
    }
  })
}
module.exports = {
  extractDeps,
  buildDepIndex,
  addDepsToItems
}