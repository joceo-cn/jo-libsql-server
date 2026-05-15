#!/bin/bash

# Jo-Libsql-Server 在线一键安装脚本
# 适用架构: x86_64, aarch64

set -e

# 1. 权限检查
if [ "$EUID" -ne 0 ]; then
  echo "请使用 root 权限运行此脚本 (sudo bash <(curl -sSL ...))"
  exit 1
fi

REPO="joceo-cn/jo-libsql-server"
INSTALL_DIR="/opt/jo-libsql-server"
BINARY_NAME="jo-libsql-server"
SERVICE_NAME="jls"

echo "----------------------------------------"
echo "  Jo-Libsql-Server 在线安装程序"
echo "----------------------------------------"

# 2. 检查依赖
for cmd in curl uname; do
    if ! command -v $cmd &> /dev/null; then
        echo "错误: 系统缺少必要工具 $cmd，请先安装。"
        exit 1
    fi
done

# 3. 识别架构
ARCH=$(uname -m)
SUFFIX=""
if [ "$ARCH" = "x86_64" ]; then
    SUFFIX="linux-amd64"
elif [ "$ARCH" = "aarch64" ]; then
    SUFFIX="linux-arm64"
else
    echo "不支持的架构: $ARCH"
    exit 1
fi

# 4. 获取最新版本号
echo "正在获取最新版本信息..."
LATEST_TAG=$(curl -s https://api.github.com/repos/$REPO/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_TAG" ]; then
    echo "无法获取最新版本号，将尝试直接下载最新发布版。"
    DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/$BINARY_NAME-$SUFFIX"
else
    echo "最新版本: $LATEST_TAG"
    DOWNLOAD_URL="https://github.com/$REPO/releases/download/$LATEST_TAG/$BINARY_NAME-$SUFFIX"
fi

# 5. 创建目录
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/logs"

# 6. 下载二进制文件
echo "正在下载二进制文件 ($SUFFIX)..."
curl -L "$DOWNLOAD_URL" -o "$INSTALL_DIR/$BINARY_NAME"
chmod +x "$INSTALL_DIR/$BINARY_NAME"

# 下载管理脚本
echo "正在下载管理脚本..."
mkdir -p "$INSTALL_DIR/scripts"
curl -L "https://raw.githubusercontent.com/$REPO/main/scripts/jls-manager.sh" -o "$INSTALL_DIR/scripts/jls-manager.sh"
curl -L "https://raw.githubusercontent.com/$REPO/main/scripts/uninstall.sh" -o "$INSTALL_DIR/scripts/uninstall.sh"
chmod +x "$INSTALL_DIR/scripts/"*.sh

# 安装 jls 管理命令
cp "$INSTALL_DIR/scripts/jls-manager.sh" "/usr/local/bin/jls"
chmod +x "/usr/local/bin/jls"

# 7. 下载/初始化配置文件
if [ ! -f "$INSTALL_DIR/config.json" ]; then
    echo "初始化默认配置文件..."
    # 尝试从仓库获取示例配置
    curl -L "https://raw.githubusercontent.com/$REPO/main/config.json.example" -o "$INSTALL_DIR/config.json" || {
        # 如果下载失败，创建一个最简配置
        cat <<EOF > "$INSTALL_DIR/config.json"
{
    "port": 12358,
    "host": "0.0.0.0",
    "db_path": "data",
    "admin_path": "admin",
    "db": {
        "main.db": "default-token"
    },
    "log_level": "INFO",
    "admin_user": "admin",
    "admin_pass": "admin123"
}
EOF
    }
fi

# 8. 创建 Systemd 服务文件
echo "配置 Systemd 服务..."
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

# 9. 启动服务
if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
    echo "正在配置 Systemd 服务 ($SERVICE_NAME)..."
    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    systemctl restart $SERVICE_NAME
else
    echo "⚠️  检测到当前环境不支持 Systemd (可能是 WSL)，已跳过服务注册。"
    echo "您可以手动启动服务: cd $INSTALL_DIR && nohup ./$BINARY_NAME > logs/system.log 2>&1 &"
fi

# 10. 获取访问信息
IP_ADDR="localhost"
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
