# 参考文档：CubeSandbox 与 E2B Infrastructure 对比

本目录收录架构评审与部署规划讨论整理而成的**内部参考文档**，不替代 [`/guide/`](../guide/introduction) 下的官方安装指南。

## 读者

- 评估**自建沙箱平台**的平台工程师
- 在 **CubeSandbox** 与 **[E2B Infrastructure](https://github.com/e2b-dev/infra)** 之间选型
- 为 CubeSandbox 选择**裸金属 vs 普通云 VM（PVM）**的运维与架构团队

## 文档索引

| 编号 | 文档 | 说明 |
|------|------|------|
| 01 | [对比总览](./01-comparison-overview.md) | 定位、功能矩阵、适用场景 |
| 02 | [架构对比](./02-architecture-comparison.md) | 组件映射、数据流、设计权衡 |
| 03 | [CubeSandbox 部署指南](./03-cubesandbox-deployment-guide.md) | 全部部署路径、端口、检查清单 |
| 04 | [E2B Infrastructure 部署指南](./04-e2b-infra-deployment-guide.md) | GCP/AWS 自建流程与节点池 |
| 05 | [运行环境与性能](./05-runtime-environment-performance.md) | 裸金属 / 嵌套 KVM / PVM 对比 |
| 06 | [选型与迁移](./06-selection-and-migration.md) | 决策树、E2B SDK 迁移、共存 |
| 07 | [机房自建与 Kubernetes](./07-on-prem-and-kubernetes.md) | 机房部署；K8s 经验；专用机 vs 进集群 |

## English versions

See [`../../issues/README.md`](../../issues/README.md).

## 相关官方文档

- [架构总览](../architecture/overview.md)
- [PVM 部署](../guide/pvm-deploy.md)
- [多机集群部署](../guide/multi-node-deploy.md)
- [本地构建部署](../guide/self-build-deploy.md)

## 维护说明

文档基于当前工作区快照整理。升级 CubeSandbox 或 E2B Infra 后请重新核对：

- 端口与环境变量（`deploy/one-click/env.example`）
- Terraform 节点池命名（`infra/iac/provider-gcp/`）
- 根目录 `README.md` 中的性能声明脚注
