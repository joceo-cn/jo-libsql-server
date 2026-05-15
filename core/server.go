package core

import (
	"context"
	"database/sql"
	"embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

var uiAssets embed.FS

type contextKey string

const dbCtxKey contextKey = "db"

// StartServer 启动 HTTP 服务
func StartServer(assets embed.FS) {
	uiAssets = assets
	mux := http.NewServeMux()

	// 注册路由
	// --- 管理后台接口 (JWT 鉴权) ---
	mux.HandleFunc("/api/admin/login", handleAdminLogin)
	mux.HandleFunc("/api/admin/config", adminAuthMiddleware(handleAdminConfig))
	mux.HandleFunc("/api/admin/tree", adminAuthMiddleware(handleAdminTree))
	mux.HandleFunc("/api/admin/db", adminAuthMiddleware(handleAdminDB))
	mux.HandleFunc("/api/admin/tables", adminAuthMiddleware(handleAdminTables))
	mux.HandleFunc("/api/admin/data", adminAuthMiddleware(handleAdminData))
	mux.HandleFunc("/api/admin/logs", adminAuthMiddleware(handleAdminLogs))
	mux.HandleFunc("/api/admin/stats", adminAuthMiddleware(handleAdminStats))
	mux.HandleFunc("/api/admin/vacuum", adminAuthMiddleware(handleAdminVacuum))

	// --- 业务接口 ---
	mux.HandleFunc("/v2/pipeline", authMiddleware(handlePipeline))
	mux.HandleFunc("/v2/debug/similarity", authMiddleware(handleDebugSimilarity))
	mux.HandleFunc("/health", handleHealth)

	
	// --- 静态资源与 UI (使用内嵌文件系统实现单二进制部署) ---
	mux.HandleFunc("/css/", func(w http.ResponseWriter, r *http.Request) {
		handleStaticFile("ui" + r.URL.Path)(w, r)
	})
	mux.HandleFunc("/js/", func(w http.ResponseWriter, r *http.Request) {
		handleStaticFile("ui" + r.URL.Path)(w, r)
	})
	mux.HandleFunc("/index.html", handleStaticFile("ui/index.html"))
	
	// 动态后台路径拦截器 (实现配置即时生效)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		cleanPath := strings.Trim(r.URL.Path, "/")
		expectedPath := strings.Trim(GlobalConfig.AdminPath, "/")

		// 1. 匹配动态后台路径
		if cleanPath == expectedPath || cleanPath == expectedPath + "/index.html" {
			handleStaticFile("ui/index.html")(w, r)
			return
		}

		// 2. 根路径自动重定向到当前配置的后台
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/" + expectedPath, http.StatusFound)
			return
		}

		// 3. 其他路径 404
		http.NotFound(w, r)
	})

	addr := fmt.Sprintf("%s:%d", GlobalConfig.Host, GlobalConfig.Port)
	log.Printf("[SERVER] 服务启动在 http://%s\n", addr)
	
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[SERVER] 启动失败: %v", err)
	}
}

// authMiddleware 简单的令牌认证中间件
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. 获取数据库名称 (核心对标：优先 Header，回退 DSN 参数)
		dbName := r.Header.Get("x-namespace")
		if dbName == "" {
			dbName = r.URL.Query().Get("namespace")
		}

		// 2. 获取 Token (核心对标：优先 Authorization Header，回退 DSN 参数)
		token := r.Header.Get("Authorization")
		if strings.HasPrefix(token, "Bearer ") {
			token = strings.TrimPrefix(token, "Bearer ")
		}
		if token == "" {
			token = r.URL.Query().Get("authToken")
		}

		// 3. 动态验证并挂载 (支持管理员 Token 穿透)
		if dbName == "" || token == "" {
			http.Error(w, "Missing database name or token", http.StatusUnauthorized)
			return
		}

		targetToken := token
		if IsAdminToken(token) {
			// 如果是管理员，自动寻找该库的业务 Token 进行挂载
			if t, ok := GlobalConfig.Databases[dbName]; ok {
				targetToken = t
			}
		}

		db, err := GetOrMountDB(dbName, targetToken)
		if err != nil {
			log.Printf("[AUTH] 鉴权或挂载失败: DB=%s, Error=%v", dbName, err)
			http.Error(w, "Unauthorized or Database not found", http.StatusUnauthorized)
			return
		}

		// 记录性能指标
		IncrementApiCall(dbName)


		// 4. 注入上下文
		ctx := context.WithValue(r.Context(), dbCtxKey, db)
		next(w, r.WithContext(ctx))
	}
}

func getDB(r *http.Request) *sql.DB {
	if db, ok := r.Context().Value(dbCtxKey).(*sql.DB); ok {
		return db
	}
	// 兼容逻辑：如果没有上下文（如健康检查），返回第一个数据库或 nil
	mu.RLock()
	defer mu.RUnlock()
	for _, inst := range DBs {
		return inst.db
	}
	return nil
}

// handleDebugSimilarity 实时计算两个向量的相似度 (用于 UI 调试)
func handleDebugSimilarity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var data struct {
		VecA string `json:"vec_a"`
		VecB string `json:"vec_b"`
	}
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	// 解码向量 A 和 B
	blobA, _ := base64.StdEncoding.DecodeString(data.VecA)
	blobB, _ := base64.StdEncoding.DecodeString(data.VecB)

	// 调用 libSQL 原生函数计算余弦距离
	db := getDB(r)
	var distance float64
	err := db.QueryRow("SELECT vector_distance_cos(?, ?)", blobA, blobB).Scan(&distance)
	
	similarity := 1.0 - distance
	if err != nil {
		log.Printf("[DEBUG] 相似度计算失败: %v (VecA_Len: %d, VecB_Len: %d)", err, len(blobA), len(blobB))
		similarity = 0.0
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"similarity": similarity,
		"distance":   distance,
		"error":      err != nil,
	})
}


// handleHealth 健康检查
func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok","engine":"libsql-embedded"}`)
}

// handleStaticFile 通用静态文件处理
func handleStaticFile(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 从内嵌文件系统读取
		html, err := uiAssets.ReadFile(path)
		if err != nil {
			log.Printf("[SERVER] 静态资源未找到: %s", path)
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		if strings.HasSuffix(path, ".css") {
			w.Header().Set("Content-Type", "text/css")
		} else if strings.HasSuffix(path, ".js") {
			w.Header().Set("Content-Type", "application/javascript")
		} else {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		}
		w.Write(html)
	}
}

// handlePipeline Hrana V2 协议实现
func handlePipeline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req HranaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	resp := HranaResponse{Results: make([]PipelineResult, 0)}

	db := getDB(r)
	for _, pReq := range req.Requests {
		var pRes PipelineResult
		pRes.Type = pReq.Type

		if pReq.Type == "execute" && pReq.Execute != nil {
			result, err := executeStmt(db, pReq.Execute.Stmt)
			if err != nil {
				pRes.Error = mapSqliteError(err)
			} else {
				pRes.Execute = &ExecuteResult{Result: *result}
			}
		} else if pReq.Type == "batch" && pReq.Batch != nil {
			err := executeBatch(db, pReq.Batch.Steps)
			if err != nil {
				pRes.Error = mapSqliteError(err)
			} else {
				pRes.Execute = &ExecuteResult{Result: ResultSet{Cols: []Column{}, Rows: [][]Value{}}}
			}
		} else {
			pRes.Error = &HranaError{Message: "Unsupported request type", Code: "ARGS_INVALID"}
		}
		
		resp.Results = append(resp.Results, pRes)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// executeStmt 执行单条 SQL 语句 (支持完整 CRUD)
func executeStmt(db *sql.DB, stmt Statement) (*ResultSet, error) {
	args := make([]interface{}, len(stmt.Args))
	for i, arg := range stmt.Args {
		args[i] = parseHranaValue(arg)
	}

	// 鲁棒的 SQL 类型检测
	cleanSQL := strings.TrimSpace(strings.ToUpper(stmt.SQL))
	isQuery := false
	
	queryPrefixes := []string{"SELECT", "PRAGMA", "WITH", "SHOW", "DESCRIBE", "EXPLAIN"}
	for _, prefix := range queryPrefixes {
		if strings.HasPrefix(cleanSQL, prefix) {
			isQuery = true
			break
		}
	}

	if isQuery {
		return runQuery(db, stmt.SQL, args)
	}
	return runExec(db, stmt.SQL, args)
}

// runQuery 执行查询类操作 (SELECT)
func runQuery(db *sql.DB, sqlStr string, args []interface{}) (*ResultSet, error) {
	start := time.Now()
	rows, err := db.Query(sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	colNames, _ := rows.Columns()
	resultSet := &ResultSet{
		Cols: make([]Column, len(colNames)),
		Rows: make([][]Value, 0),
	}
	for i, name := range colNames {
		resultSet.Cols[i] = Column{Name: name}
	}

	var rowCount int64 = 0
	for rows.Next() {
		rowCount++
		columns := make([]interface{}, len(colNames))
		columnPointers := make([]interface{}, len(colNames))
		for i := range columns {
			columnPointers[i] = &columns[i]
		}
		if err := rows.Scan(columnPointers...); err != nil {
			return nil, err
		}
		row := make([]Value, len(colNames))
		for i, val := range columns {
			row[i] = formatValue(val)
		}
		resultSet.Rows = append(resultSet.Rows, row)
	}
	
	resultSet.RowsRead = rowCount
	resultSet.QueryDurationMs = float64(time.Since(start).Microseconds()) / 1000.0
	return resultSet, nil
}

// runExec 执行变更类操作 (INSERT/UPDATE/DELETE/DDL)
func runExec(db *sql.DB, sqlStr string, args []interface{}) (*ResultSet, error) {
	start := time.Now()
	result, err := db.Exec(sqlStr, args...)
	if err != nil {
		return nil, err
	}

	affected, _ := result.RowsAffected()
	lastID, _ := result.LastInsertId()

	res := &ResultSet{
		Cols:             []Column{},
		Rows:             [][]Value{},
		AffectedRowCount: affected,
		RowsWritten:      affected,
		QueryDurationMs:  float64(time.Since(start).Microseconds()) / 1000.0,
	}
	
	if lastID > 0 {
		res.LastInsertRowid = &lastID
	}
	
	return res, nil
}

// formatValue 将 Go 类型转换为符合 Turso/libSQL 标准的 Hrana 协议值类型
func formatValue(val interface{}) Value {
	if val == nil {
		return Value{Type: "null"}
	}
	switch v := val.(type) {
	case []byte:
		// 二进制类型
		return Value{Type: "blob", Base64: base64.StdEncoding.EncodeToString(v)}
	case int, int32, int64:
		// 整数类型：对齐 libSQL 标准，必须表示为字符串，防止 JS 精度丢失
		return Value{Type: "integer", Value: fmt.Sprintf("%d", v)}
	case float32, float64:
		// 浮点数类型
		return Value{Type: "float", Value: v}
	case string:
		// 文本类型
		return Value{Type: "text", Value: v}
	case bool:
		// 布尔转整数 (SQLite 惯例)
		if v {
			return Value{Type: "integer", Value: "1"}
		}
		return Value{Type: "integer", Value: "0"}
	default:
		return Value{Type: "text", Value: fmt.Sprintf("%v", v)}
	}
}

// parseHranaValue 将 Hrana 协议值还原为 Go 原生类型 (供数据库驱动使用)
func parseHranaValue(arg Value) interface{} {
	switch arg.Type {
	case "blob":
		data, _ := base64.StdEncoding.DecodeString(arg.Base64)
		return data
	case "integer":
		// 容错处理：支持数字或字符串形式的整数
		if s, ok := arg.Value.(string); ok {
			var i int64
			fmt.Sscanf(s, "%d", &i)
			return i
		}
		if f, ok := arg.Value.(float64); ok {
			return int64(f)
		}
		return arg.Value
	case "float":
		return arg.Value
	case "null":
		return nil
	default:
		return arg.Value
	}
}

// mapSqliteError 将底层错误转换为 libSQL 标准错误码
func mapSqliteError(err error) *HranaError {
	if err == nil {
		return nil
	}
	
	msg := err.Error()
	code := "SQLITE_ERROR" // 默认错误码
	
	// 简单的模式匹配，覆盖 90% 的常见场景
	upperMsg := strings.ToUpper(msg)
	if strings.Contains(upperMsg, "UNIQUE") || strings.Contains(upperMsg, "CONSTRAINT") {
		code = "SQLITE_CONSTRAINT"
	} else if strings.Contains(upperMsg, "BUSY") {
		code = "SQLITE_BUSY"
	} else if strings.Contains(upperMsg, "READ-ONLY") {
		code = "SQLITE_READONLY"
	} else if strings.Contains(upperMsg, "LOCKED") {
		code = "SQLITE_LOCKED"
	} else if strings.Contains(upperMsg, "FULL") {
		code = "SQLITE_FULL"
	} else if strings.Contains(upperMsg, "NOT FOUND") || strings.Contains(upperMsg, "NO SUCH TABLE") {
		code = "SQLITE_ERROR"
	} else if strings.Contains(upperMsg, "SYNTAX") {
		code = "SQL_PARSE_ERROR"
	}
	
	return &HranaError{
		Message: msg,
		Code:    code,
	}
}


// executeBatch 在事务中执行多条 SQL 语句
func executeBatch(db *sql.DB, steps []BatchStep) error {
	if CheckDiskSpace(".") < 100*1024*1024 {
		return fmt.Errorf("critical error: disk space critically low, batch rejected to prevent corruption")
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, step := range steps {
		if step.Type != "execute" {
			continue
		}
		stmt := step.Stmt
		args := make([]interface{}, len(stmt.Args))
		for i, arg := range stmt.Args {
			args[i] = parseHranaValue(arg)
		}
		_, err = tx.Exec(stmt.SQL, args...)
		if err != nil {
			return fmt.Errorf("batch execution failed: %v (SQL: %s)", err, stmt.SQL)
		}
	}
	return tx.Commit()
}
