// SQL 原生执行管理
function renderSQLConsole(db = null) {
    if (db) {
        currentDb = db;
        currentTable = '';
        document.getElementById('breadcrumb').textContent = `${db} > SQL 控制台`;
        const content = document.getElementById('tab-content');
        content.innerHTML = `
            <div class="glass-card">
                <div class="tabs">
                    <div class="tab-item active">SQL 执行</div>
                </div>
                <div id="data-tab-content"></div>
            </div>
        `;
    }
    
    const tabContent = document.getElementById('data-tab-content');
    tabContent.innerHTML = `
        <div style="margin-top:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span style="font-size:12px; color:var(--text-dim)">在 [${currentDb}] 中执行原生 SQL</span>
                <button class="btn-primary" onclick="runSQL()" style="padding:8px 16px; font-size:12px;">▶ 运行语句</button>
            </div>
            <textarea id="sql-input" style="height:120px; font-family:'Fira Code', monospace; font-size:14px; margin-bottom:20px;" placeholder="SELECT * FROM ..."></textarea>
            <div id="sql-result" style="margin-top:20px;"></div>
        </div>
    `;
}

async function runSQL() {
    const sql = document.getElementById('sql-input').value.trim();
    const resultArea = document.getElementById('sql-result');
    if (!sql) return;

    resultArea.innerHTML = '<div style="opacity:0.5; font-size:12px;">正在执行...</div>';

    try {
        const res = await fetch('/v2/pipeline', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken,
                'X-Db-Name': currentDb
            },
            body: JSON.stringify({
                requests: [{ type: "execute", execute: { stmt: { sql: sql, args: [] } } }]
            })
        });
        const data = await res.json();
        const result = data.results[0];

        if (result.error) {
            resultArea.innerHTML = `<div style="color:var(--danger); font-size:13px;">❌ 错误: ${result.error.message}</div>`;
            return;
        }

        const rs = result.execute.result;
        if (rs.cols.length > 0) {
            resultArea.innerHTML = `
                <div style="font-size:12px; margin-bottom:10px; opacity:0.6">查询成功，返回 ${rs.rows.length} 条记录</div>
                <div style="overflow-x:auto; max-height:400px; border:1px solid var(--border); border-radius:10px;">
                    <table style="font-size:12px;">
                        <thead><tr>${rs.cols.map(c => `<th>${c.name}</th>`).join('')}</tr></thead>
                        <tbody>
                            ${rs.rows.map(row => `<tr>${row.map(v => `<td>${v.value === undefined ? (v.base64 ? 'BLOB' : 'NULL') : v.value}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            resultArea.innerHTML = `<div style="color:var(--success); font-size:13px;">✅ 执行成功。影响行数: ${rs.affected_row_count}</div>`;
        }

        // DDL 检测并自动刷新目录树
        const ddlKeywords = ['create', 'drop', 'alter', 'rename'];
        if (ddlKeywords.some(k => sql.toLowerCase().includes(k))) {
            if (typeof refreshTableList === 'function') {
                refreshTableList(currentDb);
            }
        }

        log(`SQL 执行成功: ${sql.substring(0, 30)}...`, 'var(--success)');
    } catch (e) {
        resultArea.innerHTML = `<div style="color:var(--danger); font-size:13px;">❌ 网络错误: ${e.message}</div>`;
    }
}
