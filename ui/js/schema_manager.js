// 表结构与字段设计管理
let editingColumn = null;

async function renderStructureView() {
    const tabContent = document.getElementById('data-tab-content');
    tabContent.innerHTML = '获取结构中...';

    try {
        const res = await fetch('/v2/pipeline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken, 'X-Db-Name': currentDb },
            body: JSON.stringify({
                requests: [{ type: "execute", execute: { stmt: { sql: `PRAGMA table_info("${currentTable}")`, args: [] } } }]
            })
        });
        const data = await res.json();
        const rs = data.results[0].execute.result;

        tabContent.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0">字段设计: ${currentTable}</h3>
                <button class="btn-primary" onclick="showFieldModal()" style="padding:8px 16px; font-size:12px;">+ 添加字段</button>
            </div>
            <table>
                <thead>
                    <tr><th>CID</th><th>名称</th><th>类型</th><th>非空</th><th>默认值</th><th>主键</th><th>操作</th></tr>
                </thead>
                <tbody>
                    ${rs.rows.map(row => {
                        const colInfo = {
                            cid: row[0].value,
                            name: row[1].value,
                            type: (row[2].value || 'ANY').toUpperCase(),
                            notnull: row[3].value,
                            dflt: row[4].value,
                            pk: row[5].value
                        };
                        return `
                        <tr>
                            <td>${colInfo.cid}</td>
                            <td style="font-weight:600; color:var(--primary)">${colInfo.name}</td>
                            <td><span class="badge" style="background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:5px; font-size:11px;">${colInfo.type}</span></td>
                            <td>${colInfo.notnull ? 'YES' : 'NO'}</td>
                            <td>${colInfo.dflt || '-'}</td>
                            <td>${colInfo.pk ? '🔑' : ''}</td>
                            <td>
                                <button class="action-btn" onclick='showFieldModal(${JSON.stringify(colInfo)})'>修改</button>
                                <button class="action-btn btn-danger" onclick="dropColumn('${colInfo.name}')">删除</button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        tabContent.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.5;">暂无数据</div>';
    }
}

// --- 字段 Modal 逻辑 (全量 libSQL 类型支持) ---
function showFieldModal(col = null) {
    editingColumn = col;
    const modal = document.getElementById('field-modal');
    const title = document.getElementById('field-modal-title');
    const form = document.getElementById('field-modal-form');
    
    modal.style.display = 'flex';
    title.textContent = col ? `修改字段: ${col.name}` : '添加新字段';
    
    const types = [
        { group: "标准类型", items: ["TEXT", "INTEGER", "REAL", "BLOB", "NUMERIC", "ANY"] },
        { group: "libSQL 向量类型", items: ["F32_BLOB", "F64_BLOB", "F16_BLOB", "INT8_BLOB", "BIT_BLOB"] },
        { group: "常用别名", items: ["VARCHAR", "BOOLEAN", "DATETIME", "JSON"] }
    ];

    form.innerHTML = `
        <div>
            <label style="font-size:12px; opacity:0.7">字段名称</label>
            <input type="text" id="field-name" value="${col ? col.name : ''}" placeholder="例如: user_vector">
        </div>
        <div>
            <label style="font-size:12px; opacity:0.7">数据类型</label>
            <select id="field-type" style="background:rgba(0,0,0,0.6); border:1px solid var(--border); color:#fff; padding:12px; border-radius:10px; width:100%; ${col ? 'cursor:not-allowed; opacity:0.6;' : ''}" ${col ? 'disabled' : ''}>
                ${types.map(g => `
                    <optgroup label="${g.group}">
                        ${g.items.map(t => `<option value="${t}" ${col && col.type === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </optgroup>
                `).join('')}
            </select>
            ${col ? '<p style="font-size:10px; color:var(--primary); margin-top:5px; opacity:0.8;">💡 温馨提示：SQLite 不支持直接修改字段类型，仅支持重命名。</p>' : ''}
        </div>
        <div style="display:flex; gap:20px; align-items:center;">
            <label style="font-size:13px; cursor:pointer; ${col ? 'opacity:0.5; cursor:not-allowed;' : ''}">
                <input type="checkbox" id="field-notnull" ${col && col.notnull ? 'checked' : ''} ${col ? 'disabled' : ''}> 必填
            </label>
            <label style="font-size:13px; cursor:pointer; ${col ? 'opacity:0.5; cursor:not-allowed;' : ''}">
                <input type="checkbox" id="field-pk" ${col && col.pk ? 'checked' : ''} ${col ? 'disabled' : ''}> 主键
            </label>
        </div>
        <div>
            <label style="font-size:12px; opacity:0.7">默认值</label>
            <input type="text" id="field-default" value="${col && col.dflt ? col.dflt : ''}" ${col ? 'disabled' : ''} placeholder="可选" style="${col ? 'opacity:0.6; cursor:not-allowed;' : ''}">
        </div>
    `;
}

function closeFieldModal() { document.getElementById('field-modal').style.display = 'none'; }

async function saveField() {
    const name = document.getElementById('field-name').value.trim();
    if (!name) return alert('字段名不能为空');

    if (editingColumn) {
        if (name === editingColumn.name) { closeFieldModal(); return; }
        const sql = `ALTER TABLE "${currentTable}" RENAME COLUMN "${editingColumn.name}" TO "${name}"`;
        await runStructureSQL(sql, `字段已成功重命名为 [${name}]`);
    } else {
        const type = document.getElementById('field-type').value;
        const notNull = document.getElementById('field-notnull').checked;
        const isPK = document.getElementById('field-pk').checked;
        const def = document.getElementById('field-default').value.trim();

        let sql = `ALTER TABLE "${currentTable}" ADD COLUMN "${name}" ${type}`;
        if (isPK) sql += " PRIMARY KEY";
        if (notNull) sql += " NOT NULL";
        if (def) sql += ` DEFAULT ${def}`;
        await runStructureSQL(sql, `字段 [${name}] 已成功添加`);
    }
    closeFieldModal();
}

async function dropColumn(colName) {
    if (!confirm(`⚠️ 警告：确定要删除字段 [${colName}] 吗？\n该列数据将永久丢失！`)) return;
    const sql = `ALTER TABLE "${currentTable}" DROP COLUMN "${colName}"`;
    await runStructureSQL(sql, `字段 [${colName}] 已删除`);
}

async function runStructureSQL(sqlOrDb, sqlOrMsg, msgOrReload, isTreeReload = false) {
    let db = currentDb; let sql = sqlOrDb; let successMsg = sqlOrMsg;
    if (isTreeReload) { db = sqlOrDb; sql = sqlOrMsg; successMsg = msgOrReload; }

    try {
        const res = await fetch('/v2/pipeline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken, 'X-Db-Name': db },
            body: JSON.stringify({ requests: [{ type: "execute", execute: { stmt: { sql: sql, args: [] } } }] })
        });
        const data = await res.json();
        if (data.results[0].error) {
            alert('操作失败: ' + data.results[0].error.message);
        } else {
            log(successMsg, 'var(--success)');
            if (isTreeReload) refreshTableList(db);
            else renderStructureView();
        }
    } catch (e) { alert('请求失败'); }
}
