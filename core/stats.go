package core

import (
	"runtime"
	"sync/atomic"
)

// 全局性能监控器
type GlobalMetrics struct {
	ApiCallCount map[string]*uint64 // 按数据库维度统计
}

var Metrics = &GlobalMetrics{
	ApiCallCount: make(map[string]*uint64),
}

// IncrementApiCall 原子增加调用计数
func IncrementApiCall(dbName string) {
	if _, ok := Metrics.ApiCallCount[dbName]; !ok {
		// 动态初始化计数器
		var count uint64
		Metrics.ApiCallCount[dbName] = &count
	}
	atomic.AddUint64(Metrics.ApiCallCount[dbName], 1)
}

// GetSystemMemUsage 获取进程从系统申请的总内存 (MB)
func GetSystemMemUsage() uint64 {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	// 使用 Sys 指标，它包含了堆、栈、以及其他内部数据结构从操作系统申请的总和
	return m.Sys / 1024 / 1024
}

