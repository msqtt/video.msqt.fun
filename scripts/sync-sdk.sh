#!/usr/bin/env bash
# 从 ../wtop-sdk 同步构建产物到 vendor/wtop（仓库自包含，无需 npm 发布）
set -euo pipefail
SDK="${1:-../wtop-sdk}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SDK" && pnpm build
for pkg in types core provider; do
  dest="$ROOT/vendor/wtop/$pkg"
  mkdir -p "$dest"
  cp -r "packages/$pkg/dist" "$dest/"
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('packages/$pkg/package.json', 'utf8'));
    delete p.scripts; delete p.devDependencies;
    for (const [k, v] of Object.entries(p.dependencies ?? {})) {
      if (v === 'workspace:*') p.dependencies[k] = 'file:../' + k.replace('@wtop/', '');
    }
    fs.writeFileSync('$dest/package.json', JSON.stringify(p, null, 2) + '\n');
  "
done
echo '✓ SDK 已同步到 vendor/wtop，请重新 pnpm install'