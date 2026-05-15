// 数据记录 (Row) CRUD 管理
let editingRowId = null;

async function loadTableData(db, table) {
    currentDb = db;
    currentTable = table;
    const content = document.getElementById('tab-content');
    document.getElementById('breadcrumb').textContent = `${db} > ${table}`;
    renderDataTabs('browse');
}

function renderDataTabs(activeTab) {
    const content = document.getElementById('tab-content');
    content.innerHTML = `
        <div class="glass-card">
            <div class="tabs">
                <div class="tab-item ${activeTab === 'browse' ? 'active' : ''}" onclick="renderDataTabs('browse')">数据浏览</div>
                <div class="tab-item ${activeTab === 'struct' ? 'active' : ''}" onclick="renderDataTabs('struct')">表结构管理</div>
                <div class="tab-item ${activeTab === 'vector' ? 'active' : ''}" onclick="renderDataTabs('vector')">向量检索</div>
                <div class="tab-item ${activeTab === 'sql' ? 'active' : ''}" onclick="renderDataTabs('sql')">SQL 执行</div>
            </div>
            <div id="data-tab-content"></div>
        </div>
    `;
    if (activeTab === 'browse') renderBrowseView();
    else if (activeTab === 'struct') renderStructureView();
    else if (activeTab === 'vector') renderVectorSearch();
    else renderSQLConsole();
}

async function renderBrowseView() {
    const tabContent = document.getElementById('data-tab-content');
    tabContent.innerHTML = '加载中...';

    try {
        // 1. 先获取表结构 (确保即使没数据也能新增)
        const sRes = await fetch(`/api/admin/data?table=${currentTable}&limit=1`, {
            headers: { 
                'Authorization': 'Bearer ' + authToken,
                'x-namespace': currentDb
            }
        });
        const sData = await sRes.json();
        currentSchema = sData.cols;

        // 2. 获取数据行
        const res = await fetch(`/api/admin/data?table=${currentTable}`, {
            headers: { 
                'Authorization': 'Bearer ' + authToken,
                'x-namespace': currentDb
            }
        });
        const data = await res.json();
        
        tabContent.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2 style="margin:0">${currentTable}</h2>
                <button class="btn-primary" onclick="showRecordModal()" style="padding:8px 16px; font-size:12px;">新增记录</button>
            </div>
            <div style="overflow-x:auto">
                <table>
                    <thead><tr>${data.cols.map(c => `<th>${c}</th>`).join('')}<th>操作</th></tr></thead>
                    <tbody>
                        ${data.rows.map((row) => {
                            const rowid = row[0];
                            const rowData = JSON.stringify(row).replace(/'/g, "&apos;");
                            return `
                                <tr>
                                    ${row.map(cell => {
                                        if (cell && cell.base64) {
                                            const vecPreview = parseVectorBlob(cell.base64);
                                            return `<td>${vecPreview ? `<span style="color:var(--success); font-family:monospace; font-size:11px;">${vecPreview}</span>` : '<i style="opacity:0.5">BLOB</i>'}</td>`;
                                        }
                                        return `<td>${cell === null ? '<i style="opacity:0.5">NULL</i>' : cell}</td>`;
                                    }).join('')}
                                    <td style="white-space:nowrap;">
                                        <button class="action-btn" onclick='showRecordModal(${rowData})'>修改</button>
                                        <button class="action-btn btn-danger" onclick="deleteRecord(${rowid})">删除</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                ${data.rows.length === 0 ? '<div style="text-align:center; padding:40px; opacity:0.5;">暂无数据记录，点击右上方“新增记录”开始。</div>' : ''}
            </div>
        `;
    } catch (e) {
        tabContent.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2 style="margin:0">${currentTable}</h2>
                <button class="btn-primary" onclick="showRecordModal()" style="padding:8px 16px; font-size:12px;">新增记录</button>
            </div>
            <div style="text-align:center; padding:40px; opacity:0.5;">暂无数据</div>
        `;
    }
}

// --- 记录 CRUD ---
function showRecordModal(rowData = null) {
    editingRowId = rowData ? rowData[0] : null;
    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('edit-modal-title') || {textContent:''};
    const form = document.getElementById('modal-form');
    
    modal.style.display = 'flex';
    if (title) title.textContent = editingRowId ? '修改记录' : '新增记录';

    form.innerHTML = currentSchema.slice(1).map((col, index) => {
        let val = '';
        if (rowData) {
            const rawVal = rowData[index + 1];
            if (rawVal && rawVal.base64) {
                // 如果是向量，尝试还原为 [x, y, z] 格式方便编辑
                const bin = atob(rawVal.base64);
                if (bin.length % 4 === 0) {
                    const floats = new Float32Array(new Uint8Array([...bin]).buffer);
                    val = `[${Array.from(floats).join(', ')}]`;
                }
            } else {
                val = rawVal === null ? '' : rawVal;
            }
        }
        return `
        <div>
            <label style="font-size:12px; opacity:0.7">${col}</label>
            <textarea data-col="${col}" rows="2" style="margin-top:5px;" placeholder="输入数据...">${val}</textarea>
        </div>
    `}).join('');
}

function closeModal() { document.getElementById('edit-modal').style.display = 'none'; }

async function submitRecord() {
    const inputs = document.querySelectorAll('#modal-form textarea');
    const cols = []; const vals = []; const placeholders = [];
    const sets = [];

    inputs.forEach(input => {
        const val = input.value.trim();
        // 允许空字符串或 NULL
        cols.push(`"${input.dataset.col}"`);
        placeholders.push('?');
        
        let processedVal = { type: "text", value: val };
        // 向量智能识别
        if (val.startsWith('[') && val.endsWith(']')) {
            try {
                const arr = JSON.parse(val);
                const buffer = new ArrayBuffer(arr.length * 4);
                const view = new DataView(buffer);
                arr.forEach((num, i) => view.setFloat32(i * 4, num, true));
                const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                processedVal = { type: "blob", base64: b64 };
            } catch(e) {}
        }
        vals.push(processedVal);
        sets.push(`"${input.dataset.col}" = ?`);
    });

    let sql = "";
    if (editingRowId) {
        sql = `UPDATE "${currentTable}" SET ${sets.join(', ')} WHERE rowid = ?`;
        vals.push({ type: "integer", value: editingRowId.toString() });
    } else {
        sql = `INSERT INTO "${currentTable}" (${cols.join(',')}) VALUES (${placeholders.join(',')})`;
    }

    try {
        const res = await fetch('/v2/pipeline', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': 'Bearer ' + authToken, 
                'x-namespace': currentDb 
            },
            body: JSON.stringify({ requests: [{ type: "execute", execute: { stmt: { sql: sql, args: vals } } }] })
        });
        const data = await res.json();
        if (data.results && data.results[0].error) throw new Error(data.results[0].error.message);
        log(`${editingRowId ? '修改' : '成功插入'}记录到 ${currentTable}`, 'var(--success)');
        closeModal();
        renderBrowseView();
    } catch (e) { alert('提交失败: ' + e.message); }
}

async function deleteRecord(rowid) {
    if (!confirm('确定要彻底删除这条记录吗？')) return;
    const sql = `DELETE FROM "${currentTable}" WHERE rowid = ?`;
    try {
        await fetch('/v2/pipeline', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': 'Bearer ' + authToken, 
                'x-namespace': currentDb 
            },
            body: JSON.stringify({ requests: [{ type: "execute", execute: { stmt: { sql: sql, args: [{type:"integer", value: rowid.toString()}] } } }] })
        });
        log(`已删除记录 ID: ${rowid}`, 'var(--primary)');
        renderBrowseView();
    } catch (e) { alert('删除失败'); }
}
