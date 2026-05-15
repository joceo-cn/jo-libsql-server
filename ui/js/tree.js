// 目录树加载与交互逻辑
async function loadDBTree() {
    const tree = document.getElementById('db-tree');
    try {
        const res = await fetch('/api/admin/tree', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (res.status === 401) return adminLogout();
        const data = await res.json();
        
        tree.innerHTML = data.map(db => `
            <div class="tree-node">
                <div class="tree-label" style="display:flex; justify-content:space-between; align-items:center;">
                    <div onclick="toggleNode(this, '${db.name}'); renderSQLConsole('${db.name}')" style="flex:1; display:flex; align-items:center; gap:10px;">
                        <span>📦</span> ${db.name}
                    </div>
                    <div class="actions" style="display:flex; gap:8px; opacity:0.8;">
                        <span onclick="createTable('${db.name}')" title="新建表" style="cursor:pointer; font-size:16px; color:var(--success)">+</span>
                        <span onclick="showDBModal('${db.name}', '${db.token}')" title="管理数据库" style="cursor:pointer; font-size:15px;">✎</span>
                        <span onclick="deleteDB('${db.name}')" title="移除数据库" style="cursor:pointer; font-size:15px; color:var(--danger)">🗑</span>
                    </div>
                </div>
                <div class="tree-children" id="children-${db.name}"></div>
            </div>
        `).join('');
    } catch (e) {
        tree.innerHTML = '<div style="padding:15px; opacity:0.5; font-size:12px;">暂无数据</div>';
    }
}

async function toggleNode(el, dbName) {
    const children = document.getElementById(`children-${dbName}`);
    el.classList.toggle('active');
    children.classList.toggle('open');
    
    if (children.innerHTML === '' && children.classList.contains('open')) {
        refreshTableList(dbName);
    }
}

async function refreshTableList(dbName) {
    const children = document.getElementById(`children-${dbName}`);
    children.innerHTML = '<div style="padding: 10px 15px; font-size:12px; opacity:0.5;">读取表中...</div>';
    try {
        const res = await fetch('/api/admin/tables', {
            headers: { 
                'Authorization': 'Bearer ' + authToken,
                'x-namespace': dbName
            }
        });
        const tables = await res.json();
        children.innerHTML = tables.map(t => `
            <div class="tree-label" style="display:flex; justify-content:space-between; align-items:center; padding-left: 20px;">
                <div onclick="loadTableData('${dbName}', '${t}')" style="flex:1;">
                    <span>📋</span> ${t}
                </div>

                <div class="actions" style="display:flex; gap:8px; opacity:0.6; font-size:12px;">
                    <span onclick="renameTable('${dbName}', '${t}')" title="重命名表" style="cursor:pointer;">✎</span>
                    <span onclick="dropTable('${dbName}', '${t}')" title="删除表" style="cursor:pointer; color:var(--danger)">×</span>
                </div>
            </div>
        `).join('');
    } catch (e) {
        children.innerHTML = '<div style="padding: 10px 15px; font-size:12px; opacity:0.5;">未找到数据表</div>';
    }
}

// --- 表结构管理逻辑 ---

async function createTable(db) {
    const tableName = prompt(`在数据库 [${db}] 中新建表，请输入表名:`);
    if (!tableName) return;
    
    // 默认创建一个带 id 的表
    const sql = `CREATE TABLE "${tableName}" (id INTEGER PRIMARY KEY AUTOINCREMENT)`;
    await executeTableSQL(db, sql, `数据表 [${tableName}] 创建成功`);
}

async function renameTable(db, oldName) {
    const newName = prompt(`将表 [${oldName}] 重命名为:`, oldName);
    if (!newName || newName === oldName) return;
    
    const sql = `ALTER TABLE "${oldName}" RENAME TO "${newName}"`;
    await executeTableSQL(db, sql, `表已重命名为 [${newName}]`);
}

async function dropTable(db, tableName) {
    if (!confirm(`⚠️ 警告：确定要彻底删除数据表 [${tableName}] 吗？\n表中所有数据将被永久粉碎！`)) return;
    
    const sql = `DROP TABLE "${tableName}"`;
    await executeTableSQL(db, sql, `数据表 [${tableName}] 已删除`);
}

async function executeTableSQL(db, sql, successMsg) {
    try {
        const res = await fetch('/v2/pipeline', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken,
                'x-namespace': db
            },
            body: JSON.stringify({
                requests: [{ type: "execute", execute: { stmt: { sql: sql, args: [] } } }]
            })
        });
        const data = await res.json();
        if (data.results && data.results[0].error) {
            alert('操作失败: ' + data.results[0].error.message);
        } else {
            log(successMsg, 'var(--success)');
            refreshTableList(db);
        }
    } catch (e) {
        alert('网络请求失败');
    }
}
