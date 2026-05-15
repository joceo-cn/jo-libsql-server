// 向量相似度检索管理
async function renderVectorSearch() {
    const tabContent = document.getElementById('data-tab-content');
    
    // 获取当前表的列信息
    let vectorCols = [];
    let allCols = [];
    try {
        const res = await fetch('/v2/pipeline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken, 'X-Db-Name': currentDb },
            body: JSON.stringify({
                requests: [{ type: "execute", execute: { stmt: { sql: `PRAGMA table_info("${currentTable}")`, args: [] } } }]
            })
        });
        const data = await res.json();
        const rows = data.results[0].execute.result.rows;
        
        allCols = rows.map(r => r[1].value);
        // 智能识别：支持多种大小写和 LibSQL 专用向量类型
        vectorCols = rows.filter(r => {
            const type = (r[2].value || '').toUpperCase();
            return type === 'BLOB' || type === 'F32_BLOB' || type.includes('VECTOR');
        }).map(r => r[1].value);

        // 如果没找到明确的向量列，则显示所有列作为备选
        if (vectorCols.length === 0) vectorCols = allCols;

    } catch(e) {
        console.error('Fetch table info failed', e);
    }

    tabContent.innerHTML = `
        <div style="margin-top:10px;">
            <div style="display:grid; grid-template-columns: 1fr 180px 100px; gap:15px; margin-bottom:20px; align-items:end;">
                <div>
                    <label style="font-size:12px; opacity:0.7">查询向量 (JSON 数组)</label>
                    <input type="text" id="v-query" placeholder="例如: [0.1, 0.5, -0.2...]" style="margin-top:5px;">
                </div>
                <div>
                    <label style="font-size:12px; opacity:0.7">目标向量列</label>
                    <select id="v-col" style="background:rgba(0,0,0,0.4); border:1px solid var(--border); color:#fff; padding:12px; border-radius:10px; width:100%; margin-top:5px;">
                        ${vectorCols.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <button class="btn-primary" onclick="executeVectorSearch()" style="padding:12px;">🔍 搜索</button>
            </div>
            <div id="v-results"></div>
        </div>
    `;
}

async function executeVectorSearch() {
    const queryStr = document.getElementById('v-query').value.trim();
    const colName = document.getElementById('v-col').value;
    const resultArea = document.getElementById('v-results');
    
    if (!queryStr || !colName) return alert('请输入查询向量并选择目标列');
    
    resultArea.innerHTML = '<div style="opacity:0.5; font-size:12px;">正在连接 libSQL 进行向量相似度计算...</div>';

    try {
        // 1. 转换查询向量为 Blob (Float32 Array)
        const arr = JSON.parse(queryStr);
        const buffer = new ArrayBuffer(arr.length * 4);
        const view = new DataView(buffer);
        arr.forEach((num, i) => view.setFloat32(i * 4, num, true));
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

        // 2. 执行向量检索 (使用余弦距离)
        const sql = `SELECT *, vector_distance_cos("${colName}", ?) as _distance FROM "${currentTable}" ORDER BY _distance ASC LIMIT 10`;
        
        const res = await fetch('/v2/pipeline', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': 'Bearer ' + authToken, 
                'X-Db-Name': currentDb 
            },
            body: JSON.stringify({
                requests: [{ type: "execute", execute: { stmt: { sql: sql, args: [{ type: "blob", base64: b64 }] } } }]
            })
        });
        
        const data = await res.json();
        if (data.results[0].error) throw new Error(data.results[0].error.message);
        
        const rs = data.results[0].execute.result;

        resultArea.innerHTML = `
            <div style="font-size:12px; margin-bottom:10px; opacity:0.6">检索完成。匹配度 = (1 - 距离) * 100%</div>
            <div style="overflow-x:auto; border-radius:12px; border:1px solid var(--border);">
                <table>
                    <thead>
                        <tr>
                            ${rs.cols.map(c => `<th>${c.name === '_distance' ? '匹配度 / 距离' : c.name}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rs.rows.map(row => `
                            <tr>
                                ${row.map((v, i) => {
                                    if (rs.cols[i].name === '_distance') {
                                        const dist = parseFloat(v.value);
                                        const similarity = ((1 - dist) * 100).toFixed(2);
                                        return `<td style="color:var(--success); font-weight:600;">${similarity}% <span style="opacity:0.5; font-weight:400; font-size:10px;">(${dist.toFixed(4)})</span></td>`;
                                    }
                                    if (v.base64) {
                                        const preview = parseVectorBlob(v.base64);
                                        return `<td style="font-family:monospace; font-size:11px; opacity:0.7">${preview || 'BLOB'}</td>`;
                                    }
                                    return `<td>${v.value === null ? 'NULL' : v.value}</td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        resultArea.innerHTML = `<div style="color:var(--danger); font-size:13px;">❌ 检索失败: ${e.message}</div>`;
    }
}
