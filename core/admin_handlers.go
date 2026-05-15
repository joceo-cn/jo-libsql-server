package core

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

// adminSecret 内部鉴权密钥
var adminSecret = "joceo-secret-2026"

// handleAdminLogin 管理员登录，发放简单 Token
func handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	var creds struct {
		User string `json:"user"`
		Pass string `json:"pass"`
	}
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	if creds.User == GlobalConfig.AdminUser && creds.Pass == GlobalConfig.AdminPass {
		// 生成一个简单的带签名的 Token: user.timestamp.signature
		ts := time.Now().Unix()
		payload := fmt.Sprintf("%s.%d", creds.User, ts)
		sig := generateSig(payload)
		token := base64.StdEncoding.EncodeToString([]byte(payload + "." + sig))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"token": token})
		return
	}
	http.Error(w, "Unauthorized", http.StatusUnauthorized)
}

// IsAdminToken 校验是否为合法的管理员 Token
func IsAdminToken(tokenStr string) bool {
	data, err := base64.StdEncoding.DecodeString(tokenStr)
	if err != nil {
		return false
	}

	parts := strings.Split(string(data), ".")
	if len(parts) != 3 {
		return false
	}

	payload := parts[0] + "." + parts[1]
	sig := parts[2]
	return sig == generateSig(payload)
}

// adminAuthMiddleware 管理后台 JWT 鉴权中间件
func adminAuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		tokenStr := strings.TrimPrefix(auth, "Bearer ")
		if !IsAdminToken(tokenStr) {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func generateSig(payload string) string {
	h := hmac.New(sha256.New, []byte(adminSecret))
	h.Write([]byte(payload))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

// handleAdminConfig 获取或更新配置
func handleAdminConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(GlobalConfig)
		return
	}

	if r.Method == http.MethodPost {
		var newCfg Config
		if err := json.NewDecoder(r.Body).Decode(&newCfg); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		// 热更新配置 (部分字段)
		GlobalConfig.Port = newCfg.Port
		GlobalConfig.Host = newCfg.Host
		GlobalConfig.DbPath = newCfg.DbPath
		GlobalConfig.AdminPath = newCfg.AdminPath
		GlobalConfig.AdminUser = newCfg.AdminUser
		GlobalConfig.AdminPass = newCfg.AdminPass
		GlobalConfig.LogLevel = newCfg.LogLevel

		// 持久化到文件
		data, _ := json.MarshalIndent(GlobalConfig, "", "    ")
		_ = os.WriteFile("config.json", data, 0644)

		w.WriteHeader(http.StatusOK)
		return
	}
}

// handleAdminTree 获取数据库目录树 (包含 Token 以便回显)
func handleAdminTree(w http.ResponseWriter, r *http.Request) {
	var tree []map[string]string
	for name, token := range GlobalConfig.Databases {
		tree = append(tree, map[string]string{
			"name":  name,
			"token": token,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tree)
}

// handleAdminTables 获取指定数据库的表列表
func handleAdminTables(w http.ResponseWriter, r *http.Request) {
	dbName := r.Header.Get("x-namespace")
	if dbName == "" {
		dbName = r.URL.Query().Get("namespace")
	}
	token := GlobalConfig.Databases[dbName]

	db, err := GetOrMountDB(dbName, token)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	rows, err := db.Query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		rows.Scan(&name)
		tables = append(tables, name)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tables)
}

// handleAdminData 浏览表数据
func handleAdminData(w http.ResponseWriter, r *http.Request) {
	dbName := r.Header.Get("x-namespace")
	if dbName == "" {
		dbName = r.URL.Query().Get("namespace")
	}
	tableName := r.URL.Query().Get("table")
	token := GlobalConfig.Databases[dbName]

	db, err := GetOrMountDB(dbName, token)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resultSet, err := runQuery(db, fmt.Sprintf("SELECT rowid, * FROM \"%s\" LIMIT 100", tableName), nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var res struct {
		Cols []string        `json:"cols"`
		Rows [][]interface{} `json:"rows"`
	}
	for _, col := range resultSet.Cols {
		res.Cols = append(res.Cols, col.Name)
	}
	for _, row := range resultSet.Rows {
		var rRow []interface{}
		for _, val := range row {
			rRow = append(rRow, val.Value)
		}
		res.Rows = append(res.Rows, rRow)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// handleAdminDB 管理数据库租户实例 (增删改)
func handleAdminDB(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		// 新增
		var req struct {
			Name  string `json:"name"`
			Token string `json:"token"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		GlobalConfig.Databases[req.Name] = req.Token
		saveConfigToFile()
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method == http.MethodPut {
		// 修改 (支持重命名)
		var req struct {
			OldName string `json:"old_name"`
			NewName string `json:"new_name"`
			Token   string `json:"token"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		// 关键优化：如果正在改名或修改配置，先卸载内存中的旧句柄
		mu.Lock()
		if inst, ok := DBs[req.OldName]; ok {
			inst.db.Close()
			delete(DBs, req.OldName)
		}
		mu.Unlock()

		// 如果名称改变，处理物理文件重命名
		if req.OldName != req.NewName {
			oldPath := GlobalConfig.DbPath + "/" + req.OldName
			newPath := GlobalConfig.DbPath + "/" + req.NewName
			if _, err := os.Stat(oldPath); err == nil {
				os.Rename(oldPath, newPath)
				// 清理旧名字留下的辅助文件
				os.Remove(oldPath + "-wal")
				os.Remove(oldPath + "-shm")
			}
			delete(GlobalConfig.Databases, req.OldName)
		}
		GlobalConfig.Databases[req.NewName] = req.Token
		saveConfigToFile()
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method == http.MethodDelete {
		// 删除 (卸载句柄 + 物理删除文件)
		name := r.URL.Query().Get("name")

		// 1. 卸载内存句柄
		mu.Lock()
		if inst, ok := DBs[name]; ok {
			inst.db.Close()
			delete(DBs, name)
		}
		mu.Unlock()

		// 2. 物理删除文件 (含 WAL 和 SHM)
		filePath := GlobalConfig.DbPath + "/" + name
		if _, err := os.Stat(filePath); err == nil {
			os.Remove(filePath)
			os.Remove(filePath + "-wal")
			os.Remove(filePath + "-shm")
		}

		// 3. 从配置中移除
		delete(GlobalConfig.Databases, name)
		saveConfigToFile()
		w.WriteHeader(http.StatusOK)
		return
	}
}

// handleAdminStats 获取所有数据库的资产统计信息
func handleAdminStats(w http.ResponseWriter, r *http.Request) {
	type DBInfo struct {
		Name   string `json:"name"`
		Size   int64  `json:"size"`
		Tables int    `json:"tables"`
		Rows   int64  `json:"rows"`
		Calls  uint64 `json:"calls"`
	}

	var stats struct {
		MemUsed   uint64   `json:"mem_used"`
		DiskTotal uint64   `json:"disk_total"`
		DBs       []DBInfo `json:"dbs"`
	}

	stats.MemUsed = GetSystemMemUsage()
	stats.DiskTotal = CheckDiskSpace(".")

	for name, token := range GlobalConfig.Databases {
		info := DBInfo{Name: name, Calls: 0}
		if c, ok := Metrics.ApiCallCount[name]; ok {
			info.Calls = atomic.LoadUint64(c)
		}

		// 文件大小
		fi, err := os.Stat(GlobalConfig.DbPath + "/" + name)
		if err == nil {
			info.Size = fi.Size()
		}

		// 表和行数统计 (快速采样)
		db, err := GetOrMountDB(name, token)
		if err == nil {
			// 查表数量
			db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table'").Scan(&info.Tables)
			// 查总行数 (性能优化：只查非系统表)
			rows, err := db.Query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var tName string
					var tCount int64
					rows.Scan(&tName)
					db.QueryRow(fmt.Sprintf("SELECT count(*) FROM \"%s\"", tName)).Scan(&tCount)
					info.Rows += tCount
				}
			}
		}
		stats.DBs = append(stats.DBs, info)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// handleAdminVacuum 执行数据库压缩
func handleAdminVacuum(w http.ResponseWriter, r *http.Request) {
	dbName := r.Header.Get("x-namespace")
	if dbName == "" {
		dbName = r.URL.Query().Get("namespace")
	}
	token := GlobalConfig.Databases[dbName]

	db, err := GetOrMountDB(dbName, token)
	if err != nil {
		http.Error(w, "DB not found", http.StatusNotFound)
		return
	}

	_, err = db.Exec("VACUUM")
	if err != nil {
		http.Error(w, "Vacuum failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func saveConfigToFile() {
	data, _ := json.MarshalIndent(GlobalConfig, "", "    ")
	_ = os.WriteFile("config.json", data, 0644)
}

// handleAdminLogs 获取系统日志
func handleAdminLogs(w http.ResponseWriter, r *http.Request) {
	logFile := "logs/system.log"

	// 如果是 DELETE 请求，执行清空日志
	if r.Method == http.MethodDelete {
		_ = os.WriteFile(logFile, []byte(""), 0644)
		w.WriteHeader(http.StatusOK)
		return
	}

	data, err := os.ReadFile(logFile)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"logs": "日志文件不存在或无法读取"})
		return
	}

	// 仅返回最后 5000 行以节省带宽
	lines := strings.Split(string(data), "\n")
	start := 0
	if len(lines) > 5000 {
		start = len(lines) - 5000
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"logs": strings.Join(lines[start:], "\n")})
}
