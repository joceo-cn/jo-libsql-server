#!/bin/bash

# JLS (Jo-Libsql-Server) 服务管理工具

SERVICE_NAME="jls"
INSTALL_DIR="/opt/jo-libsql-server"
UNINSTALL_SCRIPT="$INSTALL_DIR/scripts/uninstall.sh"

# 检查权限
if [ "$EUID" -ne 0 ]; then
  echo "请使用 root 权限运行此工具 (sudo jls)"
  exit 1
fi

show_menu() {
    echo "----------------------------------------"
    echo "    JLS 服务管理菜单 (Jo-Libsql-Server)"
    echo "----------------------------------------"
    echo "  1) 启动服务"
    echo "  2) 停止服务"
    echo "  3) 重启服务"
    echo "  4) 查看状态"
    echo "  5) 卸载服务"
    echo "  0) 退出"
    echo "----------------------------------------"
    read -p "请选择操作 [0-5]: " choice
    case $choice in
        1) start_service ;;
        2) stop_service ;;
        3) restart_service ;;
        4) status_service ;;
        5) uninstall_service ;;
        0) exit 0 ;;
        *) echo "无效选择"; show_menu ;;
    esac
}

start_service() {
    echo "正在启动 $SERVICE_NAME..."
    if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
        systemctl start $SERVICE_NAME
    else
        cd $INSTALL_DIR && nohup ./jo-libsql-server > logs/system.log 2>&1 &
    fi
    echo "操作尝试完成。"
}

stop_service() {
    echo "正在停止 $SERVICE_NAME..."
    if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
        systemctl stop $SERVICE_NAME
    else
        pkill -f jo-libsql-server || true
    fi
    echo "操作尝试完成。"
}

restart_service() {
    stop_service
    start_service
}

status_service() {
    if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then
        systemctl status $SERVICE_NAME
    else
        if pgrep -f jo-libsql-server > /dev/null; then
            echo "状态: 正在运行 (PID: $(pgrep -f jo-libsql-server))"
        else
            echo "状态: 已停止"
        fi
    fi
}

uninstall_service() {
    if [ -f "$UNINSTALL_SCRIPT" ]; then
        bash "$UNINSTALL_SCRIPT"
    else
        echo "错误: 找不到卸载脚本 $UNINSTALL_SCRIPT"
    fi
}

# 处理命令行参数
case "$1" in
    start) start_service ;;
    stop) stop_service ;;
    restart) restart_service ;;
    status) status_service ;;
    uninstall) uninstall_service ;;
    *) show_menu ;;
esac
