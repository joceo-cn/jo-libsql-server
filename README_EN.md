# Jo-Libsql-Server (jls): Lightweight Private Libsql Hrana v2 Service

> [!IMPORTANT]
> **Private Deployment, Extreme Lightweight**. Jo-Libsql-Server (jls) is a lightweight Hrana v2 service designed for private environments. It supports seamless switching between local private deployment and Turso cloud, ensuring data privacy while delivering extreme resource efficiency.

[English] | [中文](README.md)

---

## 1. Project Positioning
Jo-Libsql-Server (jls) is a Go-based Libsql proxy focused on **Private Scenarios** and **Lightweight Deployment**. It natively supports **Vector Search** and fully implements the **Hrana v2 protocol**. It is ideal for edge computing, low-spec VPS, and private AI knowledge bases where data privacy and resource constraints are critical.

## 2. Core Features
*   **🔒 Deep Privatization**: Complete local control of data, maintaining compatibility with the Turso ecosystem via a private gateway.
*   **⚡ Ultra-Lightweight**: Minimal memory footprint and single-binary deployment, perfect for edge nodes and low-end servers.
*   **🚀 Protocol Compatibility**: Fully compatible with Turso Hrana v2, supporting JS/TS, Go, Rust, Python, and PHP SDKs.
*   **🧬 Data Alignment**: Supports standard error codes, execution metadata, and query duration statistics.
*   **📂 Dynamic Multi-Tenancy**: Mount multiple `.db` files in one instance with header-based routing and hot-reloading.
*   **🧠 Vector Support**: Native support for `vector32` types and distance functions (Cosine/Euclidean/Manhattan).
*   **📊 Admin Dashboard**: Built-in dashboard for monitoring, log auditing, and visual SQL execution.

---

## 3. Performance Benchmark: Optimized for Lightweight
Deeply optimized for **low-memory servers (e.g., 1vCPU/1GB RAM)**, with resource consumption significantly lower than official standard servers.

| Dimension | Standard libSQL / Turso Server | Jo-Libsql-Server (jls) |
| :--- | :--- | :--- |
| **Memory (Idle)** | ~120MB - 200MB | **< 15MB** (Extreme memory control) |
| **Memory (100 Concurr.)** | 300MB+ | **< 40MB** |
| **Binary Size** | Heavier | **~18MB** (Static link, zero-dependency) |
| **Deployment** | Higher (Docker / Complex deps) | **Ultra-Low** (Plug-and-play) |
| **Vector Search Precision** | 100% | **100% (Native support)** |
| **Target Environment** | Cloud Clusters | **Private Cloud, 1GB RAM VPS, Raspberry Pi** |

> **Core Logic**: Efficient CGO management and stream-based protocol parsing reduce resource overhead by an order of magnitude without sacrificing vector search precision.

---

## 4. Quick Start

### Local Compilation
Supports **Full Static Linking**. Generated binaries are zero-dependency and run directly on Linux distributions.

```bash
# Build all platforms
make all

# Build Linux x64 (Full Static)
make build-linux-amd64
```



### Linux One-Click Installation

#### Method A: Online Installation (Recommended)
```bash
curl -sSL https://raw.githubusercontent.com/joceo-cn/jo-libsql-server/main/scripts/install-online.sh | sudo bash
```

#### Method B: Local Installation
1. **Run Installation**:
   ```bash
   sudo chmod +x scripts/install.sh
   sudo ./scripts/install.sh
   ```
2. **Manage Service**:
   Type **`jls`** from anywhere to access the management menu:
   - Interactive Menu: `sudo jls`
   - CLI: `sudo jls start|stop|restart|status`
   - View Logs: `tail -f /opt/jo-libsql-server/logs/system.log`

### Access Admin Dashboard
*   **Default Address**: `http://localhost:12358/admin`
*   **Default Account**: `admin`
*   **Default Password**: `admin123`

---

## 5. Developer Guide

### Database Routing Specification
*   **HTTP Header**: `x-namespace`
*   **Header Value**: Database filename (e.g., `my_database.db`)

### Example: JavaScript / TypeScript (using @libsql/client)
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

## 6. Configuration (config.json)
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

## 7. Maintenance
*   **Monitoring**: Dashboard shows memory, disk space, and API usage.
*   **Protection**: Writes are rejected when disk space is below 100MB.
*   **Optimization**: Use "Vacuum" to reclaim space and improve efficiency.

---

## 8. Protocol Compliance
| Feature | Turso Official Standard | Jo-Libsql-Server (jls) Status |
| :--- | :--- | :--- |
| **Private Support** | Limited | **Native & Deep Support** |
| **Resource Usage** | Higher | **Ultra-Lightweight** |
| **Routing Header** | `x-namespace` | **Aligned** |
| **Vector Search** | `vector32` Extension | **Native Support** |

---

## 9. Acknowledgements
- **[libSQL](https://github.com/tursodatabase/libsql)**: Vector search support.
- **[Turso](https://turso.tech)**: Hrana protocol specification.

---

**Jo-Libsql-Server (jls) focuses on providing ultra-lightweight and secure AI data management in private environments.**
