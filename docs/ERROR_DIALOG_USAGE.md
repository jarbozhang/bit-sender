# 错误对话框功能说明

## 功能概述
为了解决Toast通知几秒钟后消失、用户无法看完详细权限错误信息的问题，新增了智能错误对话框功能。

## 实现的改进

### 1. 新增 ErrorDialog 组件 (`/src/components/ErrorDialog.jsx`)
- 模态对话框显示详细错误信息
- 支持复制错误详情到剪贴板
- 支持深色模式
- 提供关闭按钮和背景点击关闭

### 2. 扩展 ToastContext (`/src/contexts/ToastContext.jsx`)
新增功能：
- `showErrorDialog({ title, message, details })` - 显示错误对话框
- `closeErrorDialog()` - 关闭错误对话框  
- `showSmartError(errorMessage, duration)` - 智能错误处理

智能错误处理逻辑：
- 检测权限相关错误关键词（`Operation not permitted`, `权限`, `sudo`, `setcap`）
- 如果是权限错误且内容超过100字符，显示详细对话框
- 同时显示简短的Toast提示"权限不足，点击查看详情"
- 普通错误仍使用Toast显示

### 3. 更新应用组件
- `App.jsx` - 集成ErrorDialog组件
- `PacketEditor.jsx` - 使用`showSmartError`处理发送错误
- `NetworkSniffer.jsx` - 使用`showSmartError`处理嗅探错误
- `ResponseMonitor.jsx` - 使用`showSmartError`处理监控错误

## 使用方式

### 基本用法
```javascript
const { showSmartError } = useToast();

try {
  await someNetworkOperation();
} catch (error) {
  // 自动检测权限错误并决定显示方式
  showSmartError(error.message);
}
```

### 手动显示错误对话框
```javascript
const { showErrorDialog } = useToast();

showErrorDialog({
  title: '权限错误',
  message: '发送数据包需要管理员权限',
  details: `详细错误信息：
发送报文失败: 发送失败: 打开网络接口 enp2s0 失败: libpcap error: socket: Operation not permitted

这通常是权限问题。解决方案:
1. 使用 sudo 运行程序
2. 或者为程序设置权限: sudo setcap cap_net_raw+ep <程序路径>
3. 或者将用户添加到 pcap 组 (如果存在): sudo usermod -a -G pcap $USER`
});
```

## 权限错误的完整处理流程

1. **用户尝试发送数据包**
2. **libpcap返回权限错误** - "socket: Operation not permitted"
3. **Rust后端包装错误** - 添加友好的错误信息和解决方案
4. **前端智能错误处理** - `showSmartError`检测到权限错误
5. **显示两种通知**：
   - Toast: "权限不足，点击查看详情" (5秒后消失)
   - 对话框: 显示完整错误信息和解决方案 (用户手动关闭)

## 界面效果

### Toast通知
- 简短提示："权限不足，点击查看详情"
- 红色错误图标
- 5秒后自动消失
- 可手动关闭

### 错误对话框
- 标题："权限错误"
- 简要说明："发送数据包需要管理员权限"
- 详细信息区域：显示完整的错误信息和解决方案
- 两个按钮：
  - "复制详情" - 复制完整错误信息到剪贴板
  - "确定" - 关闭对话框
- 右上角关闭按钮
- 点击背景也可关闭

## 好处

1. **不会丢失信息** - 详细信息保留在对话框中直到用户关闭
2. **体验友好** - Toast提供即时反馈，对话框提供详细信息
3. **解决方案明确** - 直接显示具体的解决步骤
4. **方便调试** - 支持复制错误信息用于报告问题
5. **智能检测** - 自动区分权限错误和普通错误

## 测试场景

触发权限错误对话框的操作：
1. 不使用sudo运行程序
2. 尝试发送数据包
3. 应该看到Toast和对话框同时出现
4. 对话框中应包含完整的权限错误信息和解决方案