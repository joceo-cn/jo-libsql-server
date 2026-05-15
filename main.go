package main

import (
	"embed"
	"jo-libsql-server/core"
	"log"
	"os"
	"os/signal"
	"syscall"
)

//go:embed ui/*
var uiAssets embed.FS

func main() {
	log.Println("========================================")
	log.Println("   Jo-Libsql-Server (jls)")
	log.Println("========================================")

	// 1. 加载配置
	core.LoadConfig()

	// 2. 启用分级日志持久化 (内部会检查 LogEnabled 和 LogLevel)
	core.LogToFile("logs/system.log")

	// 3. 初始化数据库引擎
	core.InitDB(core.GlobalConfig.DbPath)
	defer core.CloseDB()

	// 3. 监听系统信号实现优雅停机
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
		log.Println("[SYS] 接收到退出信号，正在关闭服务...")
		core.CloseDB()
		os.Exit(0)
	}()

	// 4. 启动 HTTP 服务 (阻塞)
	core.StartServer(uiAssets)
}
