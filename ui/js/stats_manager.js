// 数据资产与性能监控管理
async function renderDashboard() {
    const tabContent = document.getElementById('tab-content');
    tabContent.innerHTML = '<div style="padding:20px; opacity:0.5;">正在扫描全站资产...</div>';

    try {
        const res = await fetch('/api/admin/stats', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const data = await res.json();

        tabContent.innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px; margin-bottom:30px;">
                <div class="glass-card" style="padding:20px; text-align:center;">
                    <div style="font-size:12px; opacity:0.6; margin-bottom:10px;">系统内存占用</div>
                    <div style="font-size:24px; font-weight:600; color:var(--primary)">${data.mem_used} MB</div>
                </div>
                <div class="glass-card" style="padding:20px; text-align:center;">
                    <div style="font-size:12px; opacity:0.6; margin-bottom:10px;">磁盘剩余空间</div>
                    <div style="font-size:24px; font-weight:600; color:var(--success)">${(data.disk_total / 1024 / 1024 / 1024).toFixed(2)} GB</div>
                </div>
                <div class="glass-card" style="padding:20px; text-align:center;">
                    <div style="font-size:12px; opacity:0.6; margin-bottom:10px;">数据库实例</div>
                    <div style="font-size:24px; font-weight:600; color:#fff">${data.dbs.length}</div>
                </div>
            </div>

            <div class="glass-card">
                <div style="padding:20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0">资产明细与健康状态</h3>
                    <button class="action-btn" onclick="renderDashboard()">🔄 刷新数据</button>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>数据库名</th>
                            <th>物理大小</th>
                            <th>表数量</th>
                            <th>记录总数</th>
                            <th>API 调用</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.dbs.map(db => `
                            <tr>
                                <td style="font-weight:600;">${db.name}</td>
                                <td>${(db.size / 1024).toFixed(1)} KB</td>
                                <td>${db.tables}</td>
                                <td style="color:var(--primary)">${db.rows.toLocaleString()}</td>
                                <td>${db.calls} 次</td>
                                <td>
                                    <button class="action-btn" style="color:var(--success)" onclick="vacuumDB('${db.name}')">⚡ 压缩优化</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        tabContent.innerHTML = '获取统计信息失败';
    }
}

async function vacuumDB(name) {
    if (!confirm(`确定要对数据库 [${name}] 执行压缩优化吗？\n该操作会整理磁盘碎片并释放冗余空间。`)) return;
    
    log(`正在对 [${name}] 执行 VACUUM...`, 'var(--primary)');
    try {
        const res = await fetch('/api/admin/vacuum', {
            method: 'POST',
            headers: { 
                'Authorization': 'Bearer ' + authToken,
                'x-namespace': name
            }
        });

        if (res.ok) {
            log(`[${name}] 压缩优化成功`, 'var(--success)');
            renderDashboard();
        } else {
            alert('压缩失败');
        }
    } catch (e) {
        alert('请求失败');
    }
}
