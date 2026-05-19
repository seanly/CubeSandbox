# Reference Notes: CubeSandbox vs E2B Infrastructure

This directory collects **internal reference documentation** distilled from architecture reviews and deployment planning discussions. It is not a substitute for the official guides under [`/guide/`](../guide/introduction) — use those for step-by-step installation.

## Audience

- Platform engineers evaluating **self-hosted sandboxes**
- Teams deciding between **CubeSandbox** and **[E2B Infrastructure](https://github.com/e2b-dev/infra)**
- Operators choosing **bare metal vs cloud VM (PVM)** for CubeSandbox

## Document index

| # | Document | Description |
|---|----------|-------------|
| 01 | [Comparison overview](./01-comparison-overview.md) | Positioning, feature matrix, when to use which stack |
| 02 | [Architecture comparison](./02-architecture-comparison.md) | Component mapping, data flows, design trade-offs |
| 03 | [CubeSandbox deployment guide](./03-cubesandbox-deployment-guide.md) | All Cube deployment paths, requirements, ports, checklists |
| 04 | [E2B Infrastructure deployment guide](./04-e2b-infra-deployment-guide.md) | GCP/AWS self-host flow, node pools, dependencies |
| 05 | [Runtime environment & performance](./05-runtime-environment-performance.md) | Bare metal vs nested KVM vs PVM; benchmarks and sizing |
| 06 | [Selection & migration](./06-selection-and-migration.md) | Decision trees, E2B SDK migration, coexistence |
| 07 | [On-prem & Kubernetes](./07-on-prem-and-kubernetes.md) | Datacenter self-host; K8s experience; dedicated vs in-cluster |

## Chinese versions

See [`../zh/issues/`](../zh/issues/README.md) for the same set in Chinese.

## Related official docs

- [Architecture overview](../architecture/overview.md)
- [PVM deployment](../guide/pvm-deploy.md)
- [Multi-node deployment](../guide/multi-node-deploy.md)
- [Self-build deployment](../guide/self-build-deploy.md)

## Maintenance

These notes reference upstream projects as of the workspace snapshot. When upgrading CubeSandbox or E2B Infra, re-validate:

- Port numbers and env vars (`deploy/one-click/env.example`)
- Terraform node pool names (`infra/iac/provider-gcp/`)
- Published benchmark disclaimers in the root `README.md`
