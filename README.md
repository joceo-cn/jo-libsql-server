# Jo-Libsql-Server (jls): 轻量级 Libsql 私有 Hrana v2 服务

> [!IMPORTANT]
> **私有部署，极致轻量**。Jo-Libsql-Server (jls) 专为私有化环境设计的轻量级 Hrana v2 协议服务，支持在本地私有环境与 Turso 云端之间无缝切换，在保障数据隐私的同时提供极致的资源利用率。

[中文] | [English](README_EN.md)

---

## 1. 项目定位
Jo-Libsql-Server (jls) 是一个基于 Go 开发的 Libsql 代理服务。它专注于 **私有化场景** 与 **轻量化部署**，原生支持 **向量检索 (Vector Search)** 并完整实现 **Hrana v2 协议**。适用于对数据隐私要求极高且资源受限的边缘计算、低配 VPS 及私有 AI 知识库系统。

## 2. 核心特性
*   **🔒 深度私有化**：数据完全本地掌控，通过私有网关实现与 Turso 生态的兼容。
*   **⚡ 极致轻量**：极低的内存占用与单个二进制文件的部署方式，适合边缘节点。
*   **🚀 协议兼容**：兼容 Turso 官方 Hrana v2 规范，支持 JS/TS, Go, Rust, Python, PHP 等 SDK。
*   **🧬 数据对标**：支持标准错误码（Code）、执行元数据及查询耗时统计。
*   **📂 动态多租户**：单实例挂载多个 `.db` 文件，通过请求头路由，支持热重载。
*   **🧠 向量支持**：原生支持 `vector32` 向量类型及距离计算函数（Cosine/Euclidean/Manhattan）。
*   **📊 管理后台**：内置看板，支持资产监控、日志审计及可视化 SQL 执行。

---

## 3. 性能对比：极致轻量化设计
针对 **小内存服务器 (如 1核1G)** 深度优化，资源消耗显著低于官方标准服务端。

| 对比维度 | 标准 libSQL / Turso Server | Jo-Libsql-Server (jls) |
| :--- | :--- | :--- |
| **内存占用 (空载)** | ~120MB - 200MB | **< 15MB** (极致内存控制) |
| **内存占用 (100并发)** | 300MB+ | **< 40MB** |
| **二进制体积** | 较重 | **~18MB** (静态链接，零依赖) |
| **部署难度** | 较高 (依赖 Docker 或 C 库) | **极低** (解压即用) |
| **向量检索精度** | 100% | **100% (原生支持)** |
| **适用环境** | 云端集群 | **私有云、1G 内存 VPS、树莓派** |

> **核心逻辑**：通过高效的 CGO 管理与流式协议解析，在不牺牲向量搜索精度的前提下，将资源消耗降低了一个数量级。

---

## 4. 快速开始

### 本地编译
支持 **全静态链接编译**，生成的二进制文件零依赖，可直接在 Linux 发行版上运行。

```bash
# 编译所有平台
make all

# 仅编译 Linux x64 静态版
make build-linux-amd64
```



### Linux 一键服务化安装

#### 方法 A：在线一键安装 (推荐)
```bash
curl -sSL https://raw.githubusercontent.com/joceo-cn/jo-libsql-server/main/scripts/install-online.sh | sudo bash
```

#### 方法 B：源码本地安装
1. **执行安装**：
   ```bash
   sudo chmod +x scripts/install.sh
   sudo ./scripts/install.sh
   ```
2. **管理服务**：
   输入 **`jls`** 进入管理菜单：
   - 交互菜单：`sudo jls`
   - 快捷命令：`sudo jls start|stop|restart|status`
   - 查看日志：`tail -f /opt/jo-libsql-server/logs/system.log`

### 访问管理后台
*   **默认地址**：`http://localhost:12358/admin`
*   **默认账号**：`admin`
*   **默认密码**：`admin123`
> *提示：后台路径及凭据可在 config.json 中修改并即时生效。*

---

## 5. 开发者指南

### 数据库路由规范
*   **HTTP Header**: `x-namespace`
*   **Header Value**: 数据库文件名（例如 `my_knowledge_base.db`）

### 示例 1: JavaScript / TypeScript (使用 @libsql/client)
```javascript
import { createClient } from "@libsql/client";

const client = createClient({
  url: "http://localhost:12358",
  authToken: "your-db-token",
  headers: {
    "x-namespace": "my_database.db"
  }
});

const result = await client.execute("SELECT * FROM users LIMIT 5");
```

---

## 6. 配置指南 (config.json)
```json
{
    "port": 12358,
    "host": "0.0.0.0",
    "admin_path": "jo-admin",
    "db": {
        "my_database.db": "token1"
    },
    "admin_user": "admin",
    "admin_pass": "admin123",
    "log_level": "INFO"
}
```

---

## 7. 运维与自愈
*   **资源监控**：看板显示内存、磁盘空间及 API 调用频次。
*   **磁盘保护**：磁盘空间低于 100MB 时自动拒绝写操作。
*   **自愈工具**：点击“压缩优化”执行 `VACUUM` 物理释放空间。

---

## 8. 协议对标
| 特性 | Turso 官方标准 | Jo-Libsql-Server (jls) 状态 |
| :--- | :--- | :--- |
| **私有化支持** | 有限 | **原生深度支持** |
| **资源消耗** | 较高 | **极致轻量** |
| **路由头** | `x-namespace` | **对标完成** |
| **向量搜索** | `vector32` 扩展 | **原生支持** |

---

## 9. 特别鸣谢
- **[libSQL](https://github.com/tursodatabase/libsql)**: 向量检索能力支持。
- **[Turso](https://turso.tech)**: Hrana 协议规范。

---

**Jo-Libsql-Server (jls) 专注于在私有化环境下提供极致轻量且安全的 AI 数据管理方案。**
