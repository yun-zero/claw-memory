#!/bin/bash
# ClawMemory CLI Wrapper
# 使用方法:
#   ./cli.sh list [limit]     - 列出最近N条记忆
#   ./cli.sh query <tag>     - 通过标签查询记忆
#   ./cli.sh update <id> --tags a,b --summary "xxx"  - 更新记忆
#   ./cli.sh tags            - 列出所有标签

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 使用 tsx 运行 CLI
cd "$PROJECT_DIR"
exec npx tsx src/index.ts "$@"
