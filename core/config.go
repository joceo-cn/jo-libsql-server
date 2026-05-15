package core

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strconv"
)

// Config 全局配置结构
type Config struct {
	Port      int               `json:"port"`
	Host      string            `json:"host"`
	DbPath    string            `json:"db_path"`
	AdminPath string            `json:"admin_path"` // 后台访问路径
	Databases map[string]string `json:"db"`
	LogLevel  string            `json:"log_level"` // DEBUG, INFO, WARN, ERROR, CLOSE
	AdminUser string            `json:"admin_user"`
	AdminPass string            `json:"admin_pass"`
}

var GlobalConfig *Config

// LoadConfig 加载配置：遵循优先级 Flags > Env > JSON > Defaults
func LoadConfig() {
	// 1. 设置硬编码默认值
	config := &Config{
		Port:      12358,
		Host:      "127.0.0.1",
		DbPath:    "data",
		AdminPath: "admin",
		Databases: make(map[string]string),
		LogLevel:  "INFO",
	}

	// 2. 尝试从 config.json 加载 (覆盖默认值)
	loadJSON(config)

	// 3. 尝试从环境变量加载 (覆盖 JSON 和默认值)
	loadEnv(config)

	// 4. 解析命令行参数 (覆盖一切，最高优先级)
	loadFlags(config)

	GlobalConfig = config
	fmt.Printf("[CONFIG] 最终配置生效: Host=%s, Port=%d, AdminPath=/%s, LogLevel=%s\n",
		config.Host, config.Port, config.AdminPath, config.LogLevel)
}

func loadJSON(config *Config) {
	jsonFile := "config.json"
	if _, err := os.Stat(jsonFile); err == nil {
		file, err := os.ReadFile(jsonFile)
		if err == nil {
			_ = json.Unmarshal(file, config)
		}
	}
}

func loadEnv(config *Config) {
	if v := os.Getenv("JO_LIBSQL_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			config.Port = p
		}
	}
	if v := os.Getenv("JO_LIBSQL_HOST"); v != "" {
		config.Host = v
	}
	if v := os.Getenv("JO_LIBSQL_ADMIN_PATH"); v != "" {
		config.AdminPath = v
	}
	if v := os.Getenv("JO_LIBSQL_DB_DIR"); v != "" {
		config.DbPath = v
	}
	if v := os.Getenv("JO_LIBSQL_LOG_LEVEL"); v != "" {
		config.LogLevel = v
	}
}

func loadFlags(config *Config) {
	fPort := flag.Int("port", config.Port, "HTTP server port")
	fHost := flag.String("host", config.Host, "HTTP server host")
	fAdminPath := flag.String("admin_path", config.AdminPath, "Admin dashboard path")
	fDbDir := flag.String("db_dir", config.DbPath, "Database directory path")
	fLogLevel := flag.String("log_level", config.LogLevel, "Log level (DEBUG, INFO, WARN, ERROR, CLOSE)")
	flag.Parse()

	config.Port = *fPort
	config.Host = *fHost
	config.AdminPath = *fAdminPath
	config.DbPath = *fDbDir
	config.LogLevel = *fLogLevel
}
