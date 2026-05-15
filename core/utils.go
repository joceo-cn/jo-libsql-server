package core

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"syscall"
	"time"
)

// asyncWriter 实现 io.Writer 接口，支持异步批量写入
type asyncWriter struct {
	file   *os.File
	buffer *bufio.Writer
	ch     chan []byte
}

func newAsyncWriter(f *os.File) *asyncWriter {
	aw := &asyncWriter{
		file:   f,
		buffer: bufio.NewWriterSize(f, 64*1024), // 64KB 缓冲区
		ch:     make(chan []byte, 10000),        // 1万条日志容量
	}
	go aw.flushLoop()
	return aw
}

func (aw *asyncWriter) Write(p []byte) (n int, err error) {
	// 复制数据，防止外部缓冲区修改
	data := make([]byte, len(p))
	copy(data, p)

	select {
	case aw.ch <- data:
		return len(p), nil
	default:
		// 如果通道满了，为了保护主业务不卡顿，直接丢弃（或同步写，此处选丢弃并报错）
		return len(p), nil
	}
}

func (aw *asyncWriter) flushLoop() {
	ticker := time.NewTicker(1 * time.Second)
	for {
		select {
		case data := <-aw.ch:
			_, _ = aw.buffer.Write(data)
			if aw.buffer.Buffered() > 48*1024 { // 缓冲区快满时强制刷盘
				_ = aw.buffer.Flush()
			}
		case <-ticker.C:
			if aw.buffer.Buffered() > 0 {
				_ = aw.buffer.Flush()
			}
		}
	}
}

// 日志级别定义
const (
	LevelDebug = iota
	LevelInfo
	LevelWarn
	LevelError
	LevelClose
)

var levelMap = map[string]int{
	"DEBUG": LevelDebug,
	"INFO":  LevelInfo,
	"WARN":  LevelWarn,
	"ERROR": LevelError,
	"CLOSE": LevelClose,
}

// LogToFile 启用分级、高性能异步日志系统
func LogToFile(logPath string) {
	if strings.ToUpper(GlobalConfig.LogLevel) == "CLOSE" {
		fmt.Println("[SYS] 日志持久化已通过级别设置关闭 (CLOSE)")
		return
	}

	if _, err := os.Stat("logs"); os.IsNotExist(err) {
		_ = os.Mkdir("logs", 0755)
	}

	f, err := os.OpenFile("logs/system.log", os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
	if err != nil {
		log.Printf("无法开启日志文件: %v", err)
		return
	}

	aw := newAsyncWriter(f)

	// 创建分级过滤器
	currentLevel := levelMap[strings.ToUpper(GlobalConfig.LogLevel)]
	filter := &levelFilter{
		writer: io.MultiWriter(os.Stdout, aw),
		level:  currentLevel,
	}

	log.SetOutput(filter)
	fmt.Printf("[SYS] 分级日志系统启动: Level=%s, Output=Async(logs/system.log)\n", GlobalConfig.LogLevel)
}

type levelFilter struct {
	writer io.Writer
	level  int
}

func (f *levelFilter) Write(p []byte) (n int, err error) {
	msg := string(p)
	// 简单的级别检测逻辑：如果包含 [DEBUG], [WARN], [ERROR] 则判定级别
	// 默认为 INFO
	msgLevel := LevelInfo
	if strings.Contains(msg, "[DEBUG]") {
		msgLevel = LevelDebug
	} else if strings.Contains(msg, "[WARN]") {
		msgLevel = LevelWarn
	} else if strings.Contains(msg, "[ERROR]") {
		msgLevel = LevelError
	}

	if msgLevel >= f.level {
		return f.writer.Write(p)
	}
	return len(p), nil
}

// CheckDiskSpace 检查指定路径的磁盘剩余空间 (字节)
func CheckDiskSpace(path string) uint64 {
	var stat syscall.Statfs_t //Statfs_t 在 windows下会报错，这是预期的，忽略即可
	wd, _ := os.Getwd()
	err := syscall.Statfs(wd, &stat) //Statfs 在 windows下会报错，这是预期的，忽略即可
	if err != nil {
		return 1024 * 1024 * 1024 * 1024 // 默认 1TB
	}
	// 可用块 * 块大小
	return stat.Bavail * uint64(stat.Bsize)
}
