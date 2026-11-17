// Lists untranslated UI candidates for review; brand names and external content
// still require human judgment and are not automatically rewritten.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const candidates = []
function visitDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) visitDirectory(file)
    else if (entry.name.endsWith('.tsx')) inspect(file)
  }
}
function inspect(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function localized(node) {
    for (let ancestor=node.parent;ancestor;ancestor=ancestor.parent) {
      if (ts.isConditionalExpression(ancestor) && /language|\blang\b|\bde\b/.test(ancestor.condition.getText(source))) return true
    }
    return false
  }
  function walk(node) {
    let kind
    if (ts.isJsxText(node)) kind='text'
    else if (ts.isStringLiteral(node) && ts.isJsxAttribute(node.parent) && /^(?:placeholder|title|aria-label|alt)$/.test(node.parent.name.getText(source))) kind=node.parent.name.getText(source)
    else if (ts.isStringLiteral(node) && ts.isPropertyAssignment(node.parent) && /^(?:label|title|description|placeholder|message)$/.test(node.parent.name.getText(source))) kind='label'
    if (kind && !localized(node)) {
      const text=node.text.replace(/\s+/g,' ').trim()
      if (/[A-Za-zÄÖÜäöüß]{3}/.test(text)) candidates.push({file:path.relative(root,file).replaceAll('\\','/'),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,kind,text})
    }
    ts.forEachChild(node,walk)
  }
  walk(source)
}
visitDirectory(path.join(root,'src'))
fs.mkdirSync(path.join(root,'.cache'),{recursive:true})
fs.writeFileSync(path.join(root,'.cache/i18n-audit.json'),JSON.stringify(candidates,null,2))
const counts={}
for(const item of candidates)counts[item.file]=(counts[item.file]||0)+1
console.log(JSON.stringify({total:candidates.length,files:counts},null,2))
