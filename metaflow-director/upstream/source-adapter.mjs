import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
// Upstream uses whole-program TypeScript elision. Vite transpiles isolated files.
// Mark type-only re-exports from their declarations without modifying the snapshot.
export function typeExports(code, id) {
  const ast = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true),
    edits = [];
  for (const statement of ast.statements) {
    const clause = ts.isExportDeclaration(statement)
      ? statement.exportClause
      : ts.isImportDeclaration(statement)
        ? statement.importClause?.namedBindings
        : null;
    if (
      statement.isTypeOnly ||
      !statement.moduleSpecifier ||
      !clause ||
      !(ts.isNamedExports(clause) || ts.isNamedImports(clause))
    )
      continue;
    const name = statement.moduleSpecifier.text;
    if (!name.startsWith(".")) continue;
    const base = path.resolve(path.dirname(id), name),
      target = [base + ".ts", path.join(base, "index.ts")].find((p) =>
        fs.existsSync(p),
      );
    if (!target) continue;
    const text = fs.readFileSync(target, "utf8");
    for (const e of clause.elements) {
      const n = (e.propertyName ?? e.name).text;
      if (
        !e.isTypeOnly &&
        new RegExp(`(?:type|interface)\\s+${n}\\b`).test(text)
      )
        edits.push(e.getStart(ast));
    }
  }
  for (const pos of edits.sort((a, b) => b - a))
    code = code.slice(0, pos) + "type " + code.slice(pos);
  return code;
}
