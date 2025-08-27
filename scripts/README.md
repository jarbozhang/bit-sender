# 发布脚本使用指南

## 概述

自动化发布脚本可以帮助你快速发布新版本，自动处理版本号更新、Git标签创建和推送等操作。

## 使用方式

### 1. 快速发布（推荐）

```bash
# 自动递增minor版本（默认行为）
pnpm release

# 或者使用语义化版本
pnpm release:patch   # 递增补丁版本 (0.1.0 -> 0.1.1)
pnpm release:minor   # 递增次要版本 (0.1.0 -> 0.2.0)
pnpm release:major   # 递增主要版本 (0.1.0 -> 1.0.0)
```

### 2. 直接使用脚本

```bash
# 自动递增minor版本
./scripts/release.sh

# 使用语义化版本关键词
./scripts/release.sh patch
./scripts/release.sh minor
./scripts/release.sh major

# 指定具体版本号
./scripts/release.sh 1.2.3
```

## 脚本功能

### 自动化流程
1. **安全检查**
   - 检查是否在Git仓库中
   - 检查是否有未提交的更改
   - 确认当前分支（建议在main分支）

2. **版本管理**
   - 自动计算新版本号
   - 更新 `package.json` 版本
   - 更新 `src-tauri/Cargo.toml` 版本（如果存在）

3. **Git操作**
   - 提交版本更新
   - 创建版本标签
   - 推送到远程仓库

4. **自动构建**
   - 推送标签会触发GitHub Actions
   - 自动构建各平台安装包
   - 发布到GitHub Releases

### 版本号规则

遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范：

- **主版本号 (Major)**：不兼容的API修改
- **次版本号 (Minor)**：向后兼容的功能性新增
- **修订号 (Patch)**：向后兼容的问题修正

## 使用示例

### 场景1：修复Bug
```bash
# 当前版本 1.2.0，修复了一个bug
pnpm release:patch
# 新版本：1.2.1
```

### 场景2：新增功能
```bash
# 当前版本 1.2.1，新增了网卡隔离功能
pnpm release:minor
# 新版本：1.3.0
```

### 场景3：重大更新
```bash
# 当前版本 1.3.0，重构了整个架构
pnpm release:major
# 新版本：2.0.0
```

### 场景4：自定义版本
```bash
# 发布特定版本
./scripts/release.sh 1.5.0
```

## 注意事项

1. **提交更改**：发布前确保所有更改已提交
2. **测试验证**：建议在发布前进行充分测试
3. **分支管理**：推荐在main分支进行发布
4. **网络连接**：需要良好的网络连接以推送到远程仓库

## 故障排除

### 常见问题

**Q: 提示"存在未提交的更改"**
A: 使用 `git add -A && git commit -m "your message"` 提交所有更改

**Q: 提示"版本已存在"**
A: 该版本标签已存在，选择不同的版本号或删除现有标签

**Q: 推送失败**
A: 检查网络连接和Git权限设置

**Q: 脚本权限错误**
A: 运行 `chmod +x scripts/release.sh` 添加执行权限

## 输出示例

```
[INFO] 拉取最新代码...
[INFO] 当前版本: 1.0.18
[INFO] 递增minor版本: 1.1.0
[INFO] 即将发布版本: 1.0.18 -> 1.1.0
确认发布? (y/N): y
[INFO] 更新package.json版本号...
[INFO] 更新Cargo.toml版本号...
[INFO] 提交版本更新...
[INFO] 创建版本标签 v1.1.0...
[INFO] 推送代码和标签到远程仓库...
[SUCCESS] 🎉 版本 v1.1.0 发布成功!
```

这样，你就可以用一行命令轻松发布新版本了！