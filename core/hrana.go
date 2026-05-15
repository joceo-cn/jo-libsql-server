package core

// HranaRequest Hrana V2 Pipeline 请求结构
type HranaRequest struct {
	Requests []PipelineRequest `json:"requests"`
}

type PipelineRequest struct {
	Type    string         `json:"type"`
	Execute *ExecuteRequest `json:"execute,omitempty"`
	Batch   *BatchRequest   `json:"batch,omitempty"`
}

type ExecuteRequest struct {
	Stmt Statement `json:"stmt"`
}

type BatchRequest struct {
	Steps []BatchStep `json:"steps"`
}

type BatchStep struct {
	Type string    `json:"type"`
	Stmt Statement `json:"stmt"`
}

type Statement struct {
	SQL  string  `json:"sql"`
	Args []Value `json:"args"`
}

type Value struct {
	Type   string      `json:"type"`
	Value  interface{} `json:"value,omitempty"`
	Base64 string      `json:"base64,omitempty"` // 用于处理向量 BLOB
}

// HranaResponse 响应结构
type HranaResponse struct {
	Results []PipelineResult `json:"results"`
}

type PipelineResult struct {
	Type    string         `json:"type"`
	Execute *ExecuteResult `json:"execute,omitempty"`
	Error   *HranaError    `json:"error,omitempty"`
}

type ExecuteResult struct {
	Result ResultSet `json:"result"`
}

type ResultSet struct {
	Cols              []Column  `json:"cols"`
	Rows              [][]Value `json:"rows"`
	AffectedRowCount  int64     `json:"affected_row_count"`
	LastInsertRowid   *int64    `json:"last_insert_rowid,omitempty"`
	RowsRead          int64     `json:"rows_read,omitempty"`
	RowsWritten       int64     `json:"rows_written,omitempty"`
	QueryDurationMs   float64   `json:"query_duration_ms,omitempty"`
}

type Column struct {
	Name string `json:"name"`
}

type HranaError struct {
	Message string `json:"message"`
	Code    string `json:"code"`
}
