# 回此 · 把注意力还给自己

一个可以实际操作的注意力管理 demo。核心假设：保留当前意图和具体下一步，可能帮助人察觉无意识切换，并更容易回到原任务。这个 demo 用来体验流程，还没有证明干预效果。

## 体验路径

1. 写下本轮要完成的结果和下一小步，选 15、25 或 45 分钟后开始。
2. 突然想到别的事，输入一句话暂存；Ctrl/⌘ + Enter 保存，Alt + N 聚焦输入框。
3. 体验 30 秒模拟等待，可以安静等待，也可以回答一个可选问题。
4. 点小红书、抖音或朋友圈图标，模拟应用入口提醒；选择回去、确实需要使用，或主动休息 3 分钟。
5. 回来时接上刚才的下一步；结束后确认结果、查看真实计时和操作次数，并处理暂存念头。

## 已实现与边界

- 按时间戳计算的任务计时；休息会暂停任务计时，提前回来只扣除实际休息时间。
- 念头保存、处理与回看；结束任务不会清空念头。
- 同一 ChatGPT 账号的服务端状态同步，页面可见时约每 4 秒刷新，重新聚焦时立即检查。
- 本机缓存和待同步操作队列；断网后保留操作，恢复后尝试同步。浏览器清除站点数据会移除本机尚未同步的内容。
- 数据按登录用户隔离；服务端比较版本，避免两个设备的操作互相覆盖。旧任务命令绑定任务编号，防止结束另一端的新任务。
- 手机和桌面响应布局；键盘焦点、弹窗焦点约束、减少动态效果。
- **等待过程是模拟，没有连接实际 AI 任务；应用入口也是模拟，网页无法拦截真实手机应用。**
- 本轮计时和点击记录不等于实际注意力，也不用于诊断。
- 私有发布地址需要使用站点所有者账号登录。双客户端同步已测，尚未在真实 iPhone / Android 上验证系统集成。

## 技术结构

- Vinext / React / TypeScript，Cloudflare Worker 与 D1。
- `app/page.tsx`：工作台、等待、手机入口与回顾界面。
- `app/lib/session.ts`：纯状态转换和时间规则。
- `app/lib/use-attention.ts`：本机缓存、操作队列与服务端同步。
- `app/api/state/route.ts`：按用户认证的状态读取、操作应用和版本比较。
- `db/schema.ts`、`drizzle/`：数据库结构与迁移。

## 本地开发

Node.js 22.13 以上；依赖遵循项目锁文件。正常环境可运行：

```sh
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_parallel_clint_barton.sql
npm run dev -- --hostname 127.0.0.1
```

只首次创建本地数据库时执行这条迁移。生产部署会使用单独的生产数据库并自动应用迁移。

本机 Windows 的 npm 命令包装器解析有问题；本次安装直接调用同一套安装脚本，开发和构建使用下面两个等效入口，未修改全局 Node/npm：

```sh
node scripts/run-framework.mjs dev --hostname 127.0.0.1
node scripts/run-framework.mjs build
```

本机开发可打开 `/signin-with-chatgpt?return_to=/` 模拟登录；这个模拟登录不会进入生产构建。生产身份由 Sites 平台注入。

## 验证

```sh
node --experimental-strip-types --test tests/session.test.mjs tests/state-api.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

测试覆盖计时、等待和休息到期、离线事件重放、操作幂等、旧设备任务保护、输入验证、匿名拒绝、账号隔离、并发写入与冲突重试。浏览器验收记录见 `VERIFICATION.md`。
