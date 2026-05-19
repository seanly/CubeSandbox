import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(defineConfig({
  title: "Cube Sandbox",
  description: "Instant, Concurrent, Secure & Lightweight Sandbox Service for AI Agents",
  srcExclude: ['**/_template.md'],
  
  themeConfig: {
    socialLinks: [
      { icon: 'github', link: 'https://github.com/tencentcloud/CubeSandbox' }
    ]
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/' },
          { text: 'Guide', link: '/guide/introduction' },
          { text: 'Architecture', link: '/architecture/overview' },
          { text: 'Reference', link: '/issues/' },
          { text: 'About us', link: '/about-us' },
          { text: 'Changelog', link: '/changelog' },
          { text: 'GitHub', link: 'https://github.com/tencentcloud/CubeSandbox' }
        ],
        sidebar: {
          '/guide/': [
            {
              text: 'Getting Started',
              items: [
                { text: 'Introduction', link: '/guide/introduction' },
                { text: 'Quick Start', link: '/guide/quickstart' },
                { text: 'PVM Deployment', link: '/guide/pvm-deploy' },
                { text: 'Bare-Metal Deployment', link: '/guide/bare-metal-deploy' },
                { text: 'Multi-Node Cluster', link: '/guide/multi-node-deploy' },
                { text: 'Self-Build Deployment', link: '/guide/self-build-deploy' },
                { text: 'Development Environment (QEMU VM)', link: '/guide/dev-environment' }
              ]
            },
            {
              text: 'Core Concepts',
              items: [
                { text: 'Templates Overview', link: '/guide/templates' }
              ]
            },
            {
              text: 'Tutorials',
              items: [
                { text: 'Create Templates from OCI Image', link: '/guide/tutorials/template-from-image' },
                { text: 'Examples', link: '/guide/tutorials/examples' },
                { text: 'Custom Image', link: '/guide/tutorials/bring-your-own-image' }
              ]
            },
            {
              text: 'Operations',
              items: [
                { text: 'Template Inspection & Request Preview', link: '/guide/template-inspection-and-preview' },
                { text: 'HTTPS & Domain Resolution', link: '/guide/https-and-domain' },
                { text: 'Authentication', link: '/guide/authentication' }
              ]
            },
            {
              text: 'Developer Docs',
              items: [
                { text: 'Connect to an Existing Cube Cluster', link: '/guide/connect-existing-cluster' }
              ]
            },
            {
              text: 'Contribute',
              items: [
                { text: 'Troubleshooting', link: '/guide/troubleshooting/' },
                { text: 'Use Cases', link: '/guide/usecases/' },
                { text: 'Integrations', link: '/guide/integrations/' }
              ]
            }
          ],
          '/architecture/': [
            {
              text: 'System Design',
              items: [
                { text: 'Architecture Overview', link: '/architecture/overview' },
                { text: 'Networking (CubeVS)', link: '/architecture/network' }
              ]
            }
          ],
          '/issues/': [
            {
              text: 'Reference Notes',
              items: [
                { text: 'Index', link: '/issues/' },
                { text: '01 Comparison Overview', link: '/issues/01-comparison-overview' },
                { text: '02 Architecture Comparison', link: '/issues/02-architecture-comparison' },
                { text: '03 CubeSandbox Deployment', link: '/issues/03-cubesandbox-deployment-guide' },
                { text: '04 E2B Infra Deployment', link: '/issues/04-e2b-infra-deployment-guide' },
                { text: '05 Runtime & Performance', link: '/issues/05-runtime-environment-performance' },
                { text: '06 Selection & Migration', link: '/issues/06-selection-and-migration' },
                { text: '07 On-Prem & Kubernetes', link: '/issues/07-on-prem-and-kubernetes' }
              ]
            }
          ]
        }
      }
    },
    zh: {
      label: '简体中文',
      lang: 'zh',
      link: '/zh/',
      title: 'Cube Sandbox',
      description: '一个极速启动、高并发、安全且轻量化的 AI Agent 沙箱服务',
      themeConfig: {
        nav: [
          { text: '首页', link: '/zh/' },
          { text: '指南', link: '/zh/guide/introduction' },
          { text: '架构', link: '/zh/architecture/overview' },
          { text: '参考', link: '/zh/issues/' },
          { text: '关于我们', link: '/zh/about-us' },
          { text: '更新日志', link: '/zh/changelog' },
          { text: 'GitHub', link: 'https://github.com/tencentcloud/CubeSandbox' }
        ],
        sidebar: {
          '/zh/guide/': [
            {
              text: '入门指南',
              items: [
                { text: '简介 (Intro)', link: '/zh/guide/introduction' },
                { text: '快速开始', link: '/zh/guide/quickstart' },
                { text: 'PVM部署', link: '/zh/guide/pvm-deploy' },
                { text: '裸金属/物理机部署', link: '/zh/guide/bare-metal-deploy' },
                { text: '多机集群部署', link: '/zh/guide/multi-node-deploy' },
                { text: '本地构建部署', link: '/zh/guide/self-build-deploy' },
                { text: '开发环境（QEMU 虚机）', link: '/zh/guide/dev-environment' }
              ]
            },
            {
              text: '核心概念',
              items: [
                { text: '模板概览', link: '/zh/guide/templates' }
              ]
            },
            {
              text: '场景教程',
              items: [
                { text: '从 OCI 镜像制作模板', link: '/zh/guide/tutorials/template-from-image' },
                { text: '示例项目', link: '/zh/guide/tutorials/examples' },
                { text: '自定义镜像', link: '/zh/guide/tutorials/bring-your-own-image' }
              ]
            },
            {
              text: '安全与运维',
              items: [
                { text: '模板检查与请求预览', link: '/zh/guide/template-inspection-and-preview' },
                { text: 'HTTPS 证书与域名解析', link: '/zh/guide/https-and-domain' },
                { text: '鉴权', link: '/zh/guide/authentication' }
              ]
            },
            {
              text: '开发文档',
              items: [
                { text: '连接到已有 Cube 集群', link: '/zh/guide/connect-existing-cluster' }
              ]
            },
            {
              text: '社区共建',
              items: [
                { text: '故障排障', link: '/zh/guide/troubleshooting/' },
                { text: '应用案例', link: '/zh/guide/usecases/' },
                { text: '生态集成', link: '/zh/guide/integrations/' }
              ]
            }
          ],
          '/zh/architecture/': [
            {
              text: '系统设计',
              items: [
                { text: '架构概览 (Overview)', link: '/zh/architecture/overview' },
                { text: 'CubeVS 网络模型', link: '/zh/architecture/network' }
              ]
            }
          ],
          '/zh/issues/': [
            {
              text: '参考文档',
              items: [
                { text: '索引', link: '/zh/issues/' },
                { text: '01 对比总览', link: '/zh/issues/01-comparison-overview' },
                { text: '02 架构对比', link: '/zh/issues/02-architecture-comparison' },
                { text: '03 Cube 部署指南', link: '/zh/issues/03-cubesandbox-deployment-guide' },
                { text: '04 E2B 部署指南', link: '/zh/issues/04-e2b-infra-deployment-guide' },
                { text: '05 运行环境与性能', link: '/zh/issues/05-runtime-environment-performance' },
                { text: '06 选型与迁移', link: '/zh/issues/06-selection-and-migration' },
                { text: '07 机房与 Kubernetes', link: '/zh/issues/07-on-prem-and-kubernetes' }
              ]
            }
          ]
        }
      }
    }
  }
}))
