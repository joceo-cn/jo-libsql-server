#!/bin/bash

# Jo-Libsql-Server 一键安装脚本 (Linux Systemd)
# 适用架构: x86_64, aarch64

set -e

# 1. 权限检查
if [ "$EUID" -ne 0 ]; then
  echo "请使用 root 权限运行此脚本 (sudo ./install.sh)"
  exit 1
fi

INSTALL_DIR="/opt/jo-libsql-server"
BINARY_NAME="jo-libsql-server"
SERVICE_NAME="jls"

echo "开始安装 $BINARY_NAME..."

# 2. 识别架构并选择二进制文件
ARCH=$(uname -m)
BINARY_SRC=""

if [ -f "./dist/$BINARY_NAME-linux-amd64" ] && [ "$ARCH" = "x86_64" ]; then
    BINARY_SRC="./dist/$BINARY_NAME-linux-amd64"
elif [ -f "./dist/$BINARY_NAME-linux-arm64" ] && [ "$ARCH" = "aarch64" ]; then
    BINARY_SRC="./dist/$BINARY_NAME-linux-arm64"
elif [ -f "./$BINARY_NAME" ]; then
    BINARY_SRC="./$BINARY_NAME"
else
    echo "错误: 未找到适配 $ARCH 架构的二进制文件。"
    echo "请先运行 'make build-linux-amd64' 或确保当前目录下有 $BINARY_NAME 文件。"
    exit 1
fi

# 3. 创建安装目录
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/logs"

# 4. 拷贝文件
mkdir -p "$INSTALL_DIR/scripts"
cp "$BINARY_SRC" "$INSTALL_DIR/$BINARY_NAME"
cp ./scripts/* "$INSTALL_DIR/scripts/"
chmod +x "$INSTALL_DIR/$BINARY_NAME"
chmod +x "$INSTALL_DIR/scripts/"*.sh

# 安装 jls 管理命令
cp "$INSTALL_DIR/scripts/jls-manager.sh" "/usr/local/bin/jls"
chmod +x "/usr/local/bin/jls"

# 拷贝配置文件 (如果不存在)
if [ ! -f "$INSTALL_DIR/config.json" ]; then
    if [ -f "./config.json" ]; then
        cp "./config.json" "$INSTALL_DIR/config.json"
    elif [ -f "./config.json.example" ]; then
        cp "./config.json.example" "$INSTALL_DIR/config.json"
    fi
fi

# 5. 创建 Systemd 服务文件
cat <<EOF > /etc/systemd/system/$SERVICE_NAME.service
[Unit]
Description=Jo-Libsql-Server Service (JLS)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/$BINARY_NAME
Restart=always
RestartSec=5
StandardOutput=append:$INSTALL_DIR/logs/system.log
StandardError=append:$INSTALL_DIR/logs/system.log

[Install]
WantedBy=multi-user.target
EOF

# 6. 启动服务
if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
    echo "正在配置 Systemd 服务 ($SERVICE_NAME)..."
    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    systemctl restart $SERVICE_NAME
else
    echo "⚠️  检测到当前环境不支持 Systemd (可能是 WSL)，已跳过服务注册。"
    echo "您可以手动启动服务: cd $INSTALL_DIR && nohup ./$BINARY_NAME > logs/system.log 2>&1 &"
fi

# 7. 获取访问信息
HOST=$(grep '"host":' "$INSTALL_DIR/config.json" | sed -E 's/.*"host": "([^"]+)".*/\1/')
if [ "$HOST" = "0.0.0.0" ]; then
    IP_ADDR=$(hostname -I | awk '{print $1}')
    [ -z "$IP_ADDR" ] && IP_ADDR="127.0.0.1"
else
    IP_ADDR="$HOST"
fi
PORT=$(grep '"port":' "$INSTALL_DIR/config.json" | sed -E 's/.*: ([0-9]+).*/\1/')
[ -z "$PORT" ] && PORT="12358"
ADMIN_PATH=$(grep '"admin_path":' "$INSTALL_DIR/config.json" | sed -E 's/.*"admin_path": "([^"]+)".*/\1/')
[ -z "$ADMIN_PATH" ] && ADMIN_PATH="admin"
ADMIN_USER=$(grep '"admin_user":' "$INSTALL_DIR/config.json" | sed -E 's/.*"admin_user": "([^"]+)".*/\1/')
ADMIN_PASS=$(grep '"admin_pass":' "$INSTALL_DIR/config.json" | sed -E 's/.*"admin_pass": "([^"]+)".*/\1/')

echo "------------------------------------------------"
echo "✅ 安装完成！"
echo "------------------------------------------------"
echo "🖥️  管理后台地址: http://$IP_ADDR:$PORT/$ADMIN_PATH"
echo "👤 默认用户名: $ADMIN_USER"
echo "🔑 默认密码: $ADMIN_PASS"
echo "📝 重要提醒：登录后请在管理后台及时修改密码。"
echo "------------------------------------------------"
echo "📂 安装路径: $INSTALL_DIR"
echo "📊 查看日志: tail -f $INSTALL_DIR/logs/system.log"
echo "------------------------------------------------"
echo "💡 开启外网访问提示:"
echo "1. 确保 config.json 中的 \"host\" 设置为 \"0.0.0.0\""
echo "2. 防火墙放行端口 $PORT"
echo "3. 如果使用云服务器，请在安全组规则中开放 $PORT 端口"
echo "------------------------------------------------"
