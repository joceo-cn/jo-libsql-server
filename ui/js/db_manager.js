// 数据库管理 (实例级别 CRUD)
let editingDB = null;

function showDBModal(name = null, token = '') {
    editingDB = name;
    const modal = document.getElementById('db-modal');
    const title = document.getElementById('db-modal-title');
    const form = document.getElementById('db-modal-form');
    
    modal.style.display = 'flex';
    title.textContent = name ? '修改数据库配置' : '新建数据库实例';
    
    form.innerHTML = `
        <div>
            <label style="font-size:12px; opacity:0.7">数据库名称 (文件名.db)</label>
            <input type="text" id="db-input-name" value="${name || ''}" placeholder="example.db">
        </div>
        <div style="margin-top:15px;">
            <label style="font-size:12px; opacity:0.7">访问 Token (鉴权令牌)</label>
            <input type="text" id="db-input-token" value="${token}" placeholder="输入访问令牌...">
        </div>
    `;
}

function closeDbModal() { document.getElementById('db-modal').style.display = 'none'; }

async function saveDB() {
    const name = document.getElementById('db-input-name').value.trim();
    const token = document.getElementById('db-input-token').value.trim();
    
    if (!name || !token) { alert('请填写完整信息'); return; }

    const isEdit = editingDB !== null;
    const method = isEdit ? 'PUT' : 'POST';
    const body = isEdit ? { old_name: editingDB, new_name: name, token } : { name, token };

    try {
        const res = await fetch('/api/admin/db', {
            method: method,
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken 
            },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            closeDbModal();
            loadDBTree();
            log(`${isEdit ? '修改' : '新建'}数据库 [${name}] 成功`, 'var(--success)');
        }
    } catch (e) {
        alert('保存失败');
    }
}

async function deleteDB(name) {
    if (!confirm(`⚠️ 警告：确定要彻底删除数据库 [${name}] 吗？\n该操作将永久删除磁盘上的物理文件，数据不可恢复！`)) return;
    try {
        const res = await fetch(`/api/admin/db?name=${name}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (res.ok) {
            loadDBTree();
            log(`数据库 [${name}] 已移除`, 'var(--primary)');
        }
    } catch (e) {
        alert('删除失败');
    }
}

// 系统配置管理 (带选项卡与日志)
let currentConfig = null;

async function showConfig() {
    const content = document.getElementById('tab-content');
    document.getElementById('breadcrumb').textContent = '系统配置管理';
    
    try {
        const res = await fetch('/api/admin/config', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        currentConfig = await res.json();
        renderConfigTabs('params');
    } catch (e) {
        content.innerHTML = '加载失败';
    }
}

function renderConfigTabs(activeTab) {
    const content = document.getElementById('tab-content');
    content.innerHTML = `
        <div class="glass-card">
            <div class="tabs">
                <div class="tab-item ${activeTab === 'params' ? 'active' : ''}" onclick="renderConfigTabs('params')">参数配置</div>
                <div class="tab-item ${activeTab === 'logs' ? 'active' : ''}" onclick="renderConfigTabs('logs')">运行日志</div>
            </div>
            <div id="config-sub-content"></div>
        </div>
    `;
    
    if (activeTab === 'params') renderParams();
    else renderLogs();
}

function renderParams() {
    const tabContent = document.getElementById('config-sub-content');
    tabContent.innerHTML = `
        <div style="display:grid; gap:20px; margin-top:10px;">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                <div>
                    <label style="font-size:12px; color:var(--text-dim)">服务监听 IP (重启生效)</label>
                    <input type="text" id="cfg-host" value="${currentConfig.host}">
                </div>
                <div>
                    <label style="font-size:12px; color:var(--text-dim)">服务监听端口 (重启生效)</label>
                    <input type="number" id="cfg-port" value="${currentConfig.port}">
                </div>
            </div>
            <div>
                <label style="font-size:12px; color:var(--text-dim)">后台访问路径 (默认: jo-admin, 重启生效)</label>
                <input type="text" id="cfg-admin-path" value="${currentConfig.admin_path}">
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                <div>
                    <label style="font-size:12px; color:var(--text-dim)">管理员账号 (即时生效)</label>
                    <input type="text" id="cfg-user" value="${currentConfig.admin_user}">
                </div>
                <div>
                    <label style="font-size:12px; color:var(--text-dim)">管理员密码 (即时生效)</label>
                    <div style="position:relative;">
                        <input type="password" id="cfg-pass" value="${currentConfig.admin_pass}" style="padding-right:40px;">
                        <span onclick="togglePassVisibility('cfg-pass')" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; opacity:0.6; font-size:16px;">👁️</span>
                    </div>
                </div>
            </div>

            <div>
                <label style="font-size:12px; color:var(--text-dim)">数据库根目录 (重启生效)</label>
                <input type="text" id="cfg-path" value="${currentConfig.db_path}">
            </div>


            <div style="display:grid; grid-template-columns: 1fr; gap:20px;">
                <div>
                    <label style="font-size:12px; color:var(--text-dim)">运行日志级别</label>
                    <select id="cfg-log-level" style="background:rgba(0,0,0,0.4); border:1px solid var(--border); color:#fff; padding:12px; border-radius:10px; width:100%;">
                        <option value="DEBUG" ${currentConfig.log_level === 'DEBUG' ? 'selected' : ''}>DEBUG (详细调试)</option>
                        <option value="INFO" ${currentConfig.log_level === 'INFO' ? 'selected' : ''}>INFO (常规记录)</option>
                        <option value="WARN" ${currentConfig.log_level === 'WARN' ? 'selected' : ''}>WARN (仅警告)</option>
                        <option value="ERROR" ${currentConfig.log_level === 'ERROR' ? 'selected' : ''}>ERROR (仅错误)</option>
                        <option value="CLOSE" ${currentConfig.log_level === 'CLOSE' ? 'selected' : ''}>CLOSE (彻底关闭日志)</option>
                    </select>
                </div>
            </div>

            <button class="btn-primary" onclick="saveConfig()">保存配置</button>
        </div>
    `;
}

function togglePassVisibility(id) {
    const el = document.getElementById(id);
    if (el.type === 'password') {
        el.type = 'text';
    } else {
        el.type = 'password';
    }
}

async function renderLogs() {
    const tabContent = document.getElementById('config-sub-content');
    tabContent.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <span style="font-size:12px; color:var(--text-dim)">最新 5000 行系统日志</span>
            <div style="display:flex; gap:10px;">
                <button class="action-btn" onclick="fetchLogs()">🔄 刷新日志</button>
                <button class="action-btn btn-danger" onclick="clearLogs()" style="color:var(--danger)">🗑 清空日志</button>
            </div>
        </div>
        <div class="console-area" id="console-output">正在获取日志...</div>
    `;
    fetchLogs();
}

async function clearLogs() {
    if (!confirm('确定要永久清空系统运行日志吗？')) return;
    try {
        await fetch('/api/admin/logs', {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        log('系统日志已清空', 'var(--primary)');
        fetchLogs();
    } catch (e) {
        alert('清空失败');
    }
}


async function fetchLogs() {
    const consoleOutput = document.getElementById('console-output');
    if (!consoleOutput) return;
    try {
        const res = await fetch('/api/admin/logs', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();
        consoleOutput.textContent = data.logs || '暂无日志内容';
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    } catch (e) {
        consoleOutput.textContent = '获取日志失败';
    }
}

async function saveConfig() {
    const port = parseInt(document.getElementById('cfg-port').value);
    const host = document.getElementById('cfg-host').value;
    const db_path = document.getElementById('cfg-path').value;
    const admin_path = document.getElementById('cfg-admin-path').value;
    const admin_user = document.getElementById('cfg-user').value;
    const admin_pass = document.getElementById('cfg-pass').value;
    const log_level = document.getElementById('cfg-log-level').value;

    try {
        await fetch('/api/admin/config', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken 
            },
            body: JSON.stringify({ port, host, db_path, admin_path, admin_user, admin_pass, log_level })
        });



        alert('配置已保存成功');
        location.reload();
    } catch (e) {
        alert('保存失败');
    }
}
