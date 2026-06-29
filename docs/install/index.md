# CubeSandbox 安装指南

本指南面向需要在本地或自有服务器上构建、打包和部署 CubeSandbox 的用户。

CubeSandbox 是一个基于 RustVMM + KVM 的高性能 AI Agent 沙箱服务，由腾讯开源。它支持单节点部署和多节点扩展，提供 E2B SDK 兼容的 REST API。

## 适用场景

- 从源码构建发布包
- 在裸机或云服务器上单节点部署
- 了解各组件的构建、打包和部署流程

## 阅读顺序

1. [构建指南](./build.md) — 准备工具链、编译各组件
2. [打包指南](./package.md) — 生成可发布的 tar.gz
3. [部署指南](./deploy.md) — 安装包、启动服务、验证
4. [架构说明](./architecture.md) — 组件部署方式的设计理念

## 快速开始

如果你已经满足所有前置条件，可以直接执行：

```bash
# 1. 构建编译环境镜像
make builder-image

# 2. 构建完整发布包
./deploy/one-click/build-release-bundle-builder.sh

# 3. 部署
sudo ./deploy/one-click/install.sh
```

详细说明请参考各章节。
