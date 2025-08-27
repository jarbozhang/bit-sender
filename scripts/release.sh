#!/bin/bash

# 自动发布脚本
# 用法: ./scripts/release.sh [版本号]
# 如果不提供版本号，自动递增minor版本

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否在git仓库中
if [ ! -d ".git" ]; then
    log_error "当前目录不是一个Git仓库"
    exit 1
fi

# 检查是否有未提交的更改
if [ -n "$(git status --porcelain)" ]; then
    log_error "存在未提交的更改，请先提交所有更改"
    git status --short
    exit 1
fi

# 检查是否在main分支
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
    log_warning "当前不在main分支 (当前: $current_branch)"
    read -p "是否继续? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "已取消发布"
        exit 0
    fi
fi

# 拉取最新代码
log_info "拉取最新代码..."
git pull origin "$current_branch"

# 获取当前版本号
current_version=$(node -p "require('./package.json').version")
log_info "当前版本: $current_version"

# 确定新版本号
if [ -z "$1" ]; then
    # 没有提供版本号，自动递增minor版本
    new_version=$(node -e "
        const semver = '$current_version'.split('.');
        const major = parseInt(semver[0]);
        const minor = parseInt(semver[1]);
        const patch = parseInt(semver[2]);
        console.log(\`\${major}.\${minor + 1}.0\`);
    ")
    log_info "自动递增minor版本: $new_version"
else
    version_arg=$1
    case $version_arg in
        "patch")
            new_version=$(node -e "
                const semver = '$current_version'.split('.');
                const major = parseInt(semver[0]);
                const minor = parseInt(semver[1]);
                const patch = parseInt(semver[2]);
                console.log(\`\${major}.\${minor}.\${patch + 1}\`);
            ")
            log_info "递增patch版本: $new_version"
            ;;
        "minor")
            new_version=$(node -e "
                const semver = '$current_version'.split('.');
                const major = parseInt(semver[0]);
                const minor = parseInt(semver[1]);
                console.log(\`\${major}.\${minor + 1}.0\`);
            ")
            log_info "递增minor版本: $new_version"
            ;;
        "major")
            new_version=$(node -e "
                const semver = '$current_version'.split('.');
                const major = parseInt(semver[0]);
                console.log(\`\${major + 1}.0.0\`);
            ")
            log_info "递增major版本: $new_version"
            ;;
        *)
            new_version=$version_arg
            # 验证版本号格式
            if [[ ! $new_version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                log_error "无效的版本号格式: $new_version (应该是 x.y.z 格式，或使用 patch/minor/major)"
                exit 1
            fi
            log_info "使用指定版本: $new_version"
            ;;
    esac
fi

# 检查版本是否已存在
if git tag -l | grep -q "^v$new_version$"; then
    log_error "版本 v$new_version 已存在"
    exit 1
fi

# 确认发布
echo
log_info "即将发布版本: $current_version -> $new_version"
read -p "确认发布? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "已取消发布"
    exit 0
fi

# 更新package.json版本号
log_info "更新package.json版本号..."
node -e "
    const fs = require('fs');
    const pkg = require('./package.json');
    pkg.version = '$new_version';
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# 同步更新Cargo.toml版本号
if [ -f "src-tauri/Cargo.toml" ]; then
    log_info "更新Cargo.toml版本号..."
    sed -i.bak "s/^version = \".*\"/version = \"$new_version\"/" src-tauri/Cargo.toml
    rm -f src-tauri/Cargo.toml.bak
fi

# 提交版本更新
log_info "提交版本更新..."
git add package.json
if [ -f "src-tauri/Cargo.toml" ]; then
    git add src-tauri/Cargo.toml
fi

git commit -m "chore: bump version to $new_version

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 创建标签
log_info "创建版本标签 v$new_version..."
git tag -a "v$new_version" -m "Release v$new_version

🚀 自动发布版本 v$new_version

主要改进:
- 查看 GitHub Releases 页面获取详细更新说明

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 推送到远程
log_info "推送代码和标签到远程仓库..."
git push origin "$current_branch"
git push origin "v$new_version"

# 显示发布信息
echo
log_success "🎉 版本 v$new_version 发布成功!"
echo
log_info "发布信息:"
echo "  • 版本: $current_version -> $new_version"
echo "  • 标签: v$new_version"
echo "  • 分支: $current_branch"
echo
log_info "GitHub Actions 将自动构建并发布到 Releases 页面"
log_info "查看构建状态: https://github.com/$(git remote get-url origin | sed 's/.*github.com[\/:]//;s/.git$//')/actions"
echo