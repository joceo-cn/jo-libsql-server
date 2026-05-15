#!/bin/bash

# Jo-Libsql-Server 卸载脚本

set -e

if [ "$EUID" -ne 0 ]; then
  echo "请使用 root 权限运行此脚本 (sudo ./uninstall.sh)"
  exit 1
fi

SERVICE_NAME="jls"
BINARY_NAME="jo-libsql-server"
INSTALL_DIR="/opt/jo-libsql-server"

echo "正在停止并卸载 $SERVICE_NAME..."

if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
    systemctl stop $SERVICE_NAME || true
    systemctl disable $SERVICE_NAME || true
    rm -f /etc/systemd/system/$SERVICE_NAME.service
    systemctl daemon-reload
else
    echo "⚠️  当前环境不支持 Systemd，将直接跳过服务卸载步骤。"
    # 如果是手动启动的，提醒用户手动杀进程
    pkill -f $BINARY_NAME || true
fi

# 移除管理命令
rm -f "/usr/local/bin/jls"

echo "是否删除安装目录及数据 ($INSTALL_DIR)? [y/N]"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    rm -rf "$INSTALL_DIR"
    echo "已清理所有文件。"
else
    echo "安装目录已保留。"
fi

echo "卸载完成。"
