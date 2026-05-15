package core

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "github.com/tursodatabase/go-libsql"
)

type dbInstance struct {
	db         *sql.DB
	lastAccess time.Time
}

var (
	DBs   = make(map[string]*dbInstance)
	mu    sync.RWMutex
	dbDir string
)

const idleTimeout = 30 * time.Minute

// InitDB 初始化数据库基础环境
func InitDB(path string) {
	dbDir = path
	if _, err := os.Stat(dbDir); os.IsNotExist(err) {
		_ = os.MkdirAll(dbDir, 0755)
	}

	// 启动后台清理协程
	go startCleaner()

	log.Printf("[DB] 基础目录已就绪: %s (动态挂载模式，超时回收: %v)", dbDir, idleTimeout)
}

// GetOrMountDB 动态获取或挂载数据库，并更新访问时间
func GetOrMountDB(name, token string) (*sql.DB, error) {
	// 1. 验证配置
	expectedToken, ok := GlobalConfig.Databases[name]
	if !ok || expectedToken != token {
		return nil, fmt.Errorf("invalid database name or token")
	}

	// 2. 检查并更新访问时间
	mu.Lock()
	defer mu.Unlock()

	if inst, exists := DBs[name]; exists {
		inst.lastAccess = time.Now()
		return inst.db, nil
	}

	// 3. 执行挂载
	fullPath := filepath.Join(dbDir, name)
	db := openOneDB(fullPath)
	DBs[name] = &dbInstance{
		db:         db,
		lastAccess: time.Now(),
	}
	log.Printf("[DB] 动态挂载成功: %s", name)
	return db, nil
}

// startCleaner 定时清理长期未使用的数据库连接
func startCleaner() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		mu.Lock()
		now := time.Now()
		for name, inst := range DBs {
			if now.Sub(inst.lastAccess) > idleTimeout {
				_ = inst.db.Close()
				delete(DBs, name)
				log.Printf("[DB] 数据库 %s 因长时间未访问已自动卸载回收", name)
			}
		}
		mu.Unlock()
	}
}

func openOneDB(dbPath string) *sql.DB {
	dsn := fmt.Sprintf("file:%s", dbPath)
	db, err := sql.Open("libsql", dsn)
	if err != nil {
		log.Fatalf("[DB] 无法打开数据库 %s: %v", dbPath, err)
	}

	// 启用 WAL 模式以提高并发性能
	var mode string
	err = db.QueryRow("PRAGMA journal_mode=WAL;").Scan(&mode)
	if err != nil {
		log.Printf("[DB] 警告: 无法为 %s 设置 WAL 模式: %v", dbPath, err)
	} else {
		log.Printf("[DB] %s 模式已设为: %s", dbPath, mode)
	}

	// 强制启用同步模式
	_, _ = db.Exec("PRAGMA synchronous=NORMAL;")

	// 优化连接池
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)

	return db
}

// CloseDB 优雅关闭所有已挂载的数据库
func CloseDB() {
	mu.Lock()
	defer mu.Unlock()

	for name, inst := range DBs {
		if inst.db != nil {
			_ = inst.db.Close()
			log.Printf("[DB] 数据库 %s 已优雅关闭", name)
		}
	}
}
