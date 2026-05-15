# Jo-Libsql-Server Makefile

BINARY_NAME=jo-libsql-server
VERSION=0.1.0
# 黄金编译参数：全静态链接 + 符号瘦身
LDFLAGS=-linkmode external -extldflags "-static" -s -w

all: clean build-linux-amd64 build-linux-arm64 build-darwin-arm64

clean:
	rm -rf dist/
	mkdir -p dist/

build-linux-amd64:
	@echo "Building for Linux (x86_64) Full Static..."
	GOOS=linux GOARCH=amd64 CGO_ENABLED=1 go build -mod=vendor -ldflags='$(LDFLAGS)' -o dist/$(BINARY_NAME)-linux-amd64 main.go

build-linux-arm64:
	@echo "Building for Linux (ARM64) Full Static..."
	# 注意：本地 ARM 编译需要安装 aarch64-linux-gnu-gcc
	GOOS=linux GOARCH=arm64 CGO_ENABLED=1 CC=aarch64-linux-gnu-gcc go build -mod=vendor -ldflags='$(LDFLAGS)' -o dist/$(BINARY_NAME)-linux-arm64 main.go

build-darwin-arm64:
	@echo "Building for macOS (Apple Silicon)..."
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 go build -mod=vendor -ldflags='-s -w' -o dist/$(BINARY_NAME)-darwin-arm64 main.go

install:
	@chmod +x scripts/install.sh
	@sudo ./scripts/install.sh

uninstall:
	@chmod +x scripts/uninstall.sh
	@sudo ./scripts/uninstall.sh

.PHONY: all clean build-linux-amd64 build-linux-arm64 build-darwin-arm64 install uninstall
