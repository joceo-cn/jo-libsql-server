// JWT 状态管理与核心工具
let authToken = localStorage.getItem('admin_token');
let currentDb = '';
let currentTable = '';
let currentSchema = [];

document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        showMain();
    } else {
        const loginOverlay = document.getElementById('login-overlay');
        if (loginOverlay) loginOverlay.style.display = 'flex';
    }
});


// 向量处理工具：将 Base64 的 F32_BLOB 转换为可读数组
function parseVectorBlob(b64) {
    try {
        const bin = atob(b64);
        if (bin.length % 4 !== 0) return null;
        const buf = new ArrayBuffer(bin.length);
        const view = new DataView(buf);
        for (let i = 0; i < bin.length; i++) view.setUint8(i, bin.charCodeAt(i));
        const floats = new Float32Array(buf);
        const preview = Array.from(floats).slice(0, 3).map(n => n.toFixed(3)).join(', ');
        return `[${preview}...] (${floats.length}D)`;
    } catch (e) { return null; }
}

async function adminLogin() {
    const user = document.getElementById('admin-user').value;
    const pass = document.getElementById('admin-pass').value;
    const msg = document.getElementById('login-msg');

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, pass })
        });
        if (!res.ok) {
            msg.textContent = '账号或密码错误';
            return;
        }
        const data = await res.json();
        if (data.token) {
            authToken = data.token;
            localStorage.setItem('admin_token', authToken);
            showMain();
            log('登录成功', 'var(--success)');
        }
    } catch (e) {
        msg.textContent = '服务连接失败';
    }
}

function adminLogout() {
    localStorage.removeItem('admin_token');
    location.reload();
}

function showMain() {
    document.getElementById('login-overlay').style.display = 'none';
    const appFrame = document.getElementById('app-frame');
    if (appFrame) {
        appFrame.style.display = 'flex';
        // 关键点：激活 CSS 中的 opacity: 1 状态
        setTimeout(() => appFrame.classList.add('ready'), 50);
    }
    loadDBTree();
    if (typeof renderDashboard === 'function') {
        renderDashboard();
    }
}

function log(msg, color = 'var(--text-dim)') {
    const term = document.getElementById('server-status');
    if (term) {
        term.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        term.style.color = color;
    }
}
