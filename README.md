# 阿成的个人博客

这是阿成的个人博客项目，用来记录学习、写作、技术笔记和日常思考。网站基于开源项目二次搭建，并部署在 Cloudflare Workers 上。

- 线上地址：<https://blog-acheng.com>
- GitHub 仓库：<https://github.com/cdg-hue/myblog>
- 后台入口：`/admin/login`

## 项目说明

这个博客不是纯静态页面，而是一套带后台的完整博客系统。它支持文章编辑、分类管理、图片上传、主题设置、搜索、RSS、站点地图，以及 AI 写作辅助等能力。

我会基于这个项目继续做自己的内容和样式调整，让它逐步变成一个真正属于自己的长期写作空间。

## 当前功能

- 个人博客首页和文章详情页
- 后台文章管理与在线编辑
- 分类、导航、站点设置
- 图片上传与封面图管理
- 全文搜索
- RSS Feed 和 Sitemap
- Cloudflare Workers 部署
- Cloudflare D1 数据库
- Cloudflare R2 图片存储
- `www.blog-acheng.com` 自动跳转到 `blog-acheng.com`

## 技术栈

- Next.js 16
- React 19
- TypeScript
- OpenNext for Cloudflare
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Novel / Tiptap

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

常用入口：

- 首页：`/`
- 后台：`/admin`
- 编辑器：`/editor`

## 部署

当前项目部署在 Cloudflare Workers，主要配置文件是：

- `wrangler.local.toml`
- `.env.local`

注意：`.env.local`、`wrangler.local.toml` 等本地密钥和部署配置文件不会提交到 GitHub。

常用部署流程：

```bash
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy -c wrangler.local.toml
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | Next.js 本地开发 |
| `npm run build` | 构建应用 |
| `npm run verify:quick` | 跑 lint、test、build |
| `npm run verify` | 跑完整验证链路 |
| `npm run preview` | Worker 运行时预览 |
| `npm run deploy` | 部署到 Cloudflare Workers |

## 开源来源与致谢

本项目基于 Qiaomu Blog Open Source 二次搭建和修改。

原始项目：

- 项目名称：Qiaomu Blog Open Source
- 原始仓库：<https://github.com/joeseesun/qiaomu-blog-opensource>
- 在线示例：<https://blog.qiaomu.ai/>
- 介绍文章：<https://blog.qiaomu.ai/qiaomu-blog-opensource>

原作者：

- 向阳乔木
- GitHub：<https://github.com/joeseesun>
- X / Twitter：<https://x.com/vista8>
- Blog：<https://blog.qiaomu.ai/>

感谢原作者提供的开源项目基础。

## License

本项目沿用原项目的 MIT License。详见 [LICENSE](./LICENSE)。
