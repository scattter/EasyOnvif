#!/bin/bash
# 数据库初始化脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${SCRIPT_DIR}/../storage/config/database.sqlite"

echo "Initializing EasyONVIF database..."

# 确保目录存在
mkdir -p "$(dirname "$DB_PATH")"

# 检查 SQLite3 是否安装
if ! command -v sqlite3 &> /dev/null; then
    echo "Error: sqlite3 is not installed"
    exit 1
fi

# 检查数据库是否已存在
if [ -f "$DB_PATH" ]; then
    echo "Database already exists at $DB_PATH"
    read -p "Do you want to reinitialize? This will DELETE all data! (y/N): " confirm
    if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
        echo "Creating backup..."
        cp "$DB_PATH" "${DB_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
        rm "$DB_PATH"
    else
        echo "Skipping initialization."
        exit 0
    fi
fi

# 创建数据库
echo "Creating database at $DB_PATH..."

sqlite3 "$DB_PATH" < "${SCRIPT_DIR}/create_tables.sql"
sqlite3 "$DB_PATH" < "${SCRIPT_DIR}/create_indexes.sql"
sqlite3 "$DB_PATH" < "${SCRIPT_DIR}/seed_data.sql"

echo "Database initialized successfully!"
echo "Default credentials:"
echo "  Username: admin"
echo "  Password: admin"
