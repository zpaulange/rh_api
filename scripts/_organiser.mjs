import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const fichiers = process.argv.slice(2).map((f) => path.resolve(f));
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json', ts.sys.readFile).config, ts.sys, '.');
const versions = new Map();
const hote = {
  getScriptFileNames: () => cfg.fileNames,
  getScriptVersion: (f) => String(versions.get(f) ?? 0),
  getScriptSnapshot: (f) => (fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8')) : undefined),
  getCurrentDirectory: () => process.cwd(),
  getCompilationSettings: () => cfg.options,
  getDefaultLibFileName: ts.getDefaultLibFilePath,
  fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory,
};
const ls = ts.createLanguageService(hote);
for (const f of fichiers) {
  const changes = ls.organizeImports({ type: 'file', fileName: f, mode: 'RemoveUnused' }, { quotePreference: 'single' }, undefined);
  let texte = fs.readFileSync(f, 'utf8');
  for (const c of changes) for (const e of [...c.textChanges].sort((a, b) => b.span.start - a.span.start)) texte = texte.slice(0, e.span.start) + e.newText + texte.slice(e.span.start + e.span.length);
  fs.writeFileSync(f, texte);
  versions.set(f, (versions.get(f) ?? 0) + 1);
  console.log('organisé', path.relative(process.cwd(), f));
}
