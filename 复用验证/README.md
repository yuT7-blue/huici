# 回此的开源复用验证

2026 年 11 月 19 日。先验证一个小问题：能否借用已有扩展识别 AI 等待的方式，在原对话旁给用户一个思考入口，并在回答可读时自动让开。

## 网页小样怎么试

在桌面 Chrome 或 Edge 的扩展管理页开启开发者模式，选择「加载已解压的扩展程序」，选中本目录下的「网页等待提示」文件夹，刷新 ChatGPT 网页。发一条通常需要等待几秒的请求。识别到生成状态持续约 3 秒，且页面尚未出现本轮可读回答时，最新用户消息下方会出现一句「等答案出来，你想先核对刚才提到的哪一点？」。可点「安静等」收起。回复开始显示或等待结束时提示自动移除。

这是固定问题的对照版本，只在当前网页工作。扩展不申请存储权限，没有网络请求。若真实网页没有触发，要先核对该页面的停止按钮及消息标记，再评价问题本身。Chrome 本地构造页面上的 9 项断言已通过，包括短等待不显示、长等待只显示一次、主动收起、下一轮重置、回复开始可读及取消后退场。真实登录会话、移动设备和系统级跨端触发尚待试用。

## 五个项目里具体能借什么

| 项目和固定源码版本 | 源码中的机制 | 对回此的取舍 |
| --- | --- | --- |
| [FocusWhileAI · 检测模块](https://github.com/RudhraBharathy/FocusWhileAI/blob/a9273234ff6bcf6960142bbdbfff8a39f78f677e/src/utils/siteDetect.ts) | 查找各网站特定的停止按钮，推断是否仍在生成。其等待层在生成结束时显示关闭按钮。 | 网页小样沿用 ChatGPT 英文停止按钮选择器与 DOM 检测方式，补充一个按钮标记；提示位于消息下方，回答开始可读就收起。附上游 MIT 许可证。网页标记仍需随站点变化维护。 |
| [Study Buddy · 提问逻辑](https://github.com/papihaj/study-buddy-plugin/blob/7bfe5c0a539a84295d2199e084a18fac3d5e6d4c/hooks/register.tsx) | 在主任务一轮开始时安排提问，从近期对话提取材料；材料不足时跳过，问题生成可以返回空值。依赖 Claude Code 的插件和模型接口。 | 可借鉴「只问当前任务里有依据的一件事」。先把固定问题做成对照，再判断动态提问的相关性提升是否值得多一次模型调用。 |
| [meanwhile · 状态写入脚本](https://github.com/ismailbayram/meanwhile/blob/5fcc5c165b1702eb948d789f229e7921cbd4dcce/hooks/meanwhile-state.sh) | 提交和结束事件写入 busy/idle；按项目路径生成文件名，同目录的会话共享一个文件。 | 用于单任务桌面试验很合适。如果同时发起两项任务，其中一项先结束就可能覆盖另一项的忙碌状态。手机跟随具体轮次时需要单独的任务标识。 |
| [Pause · Android 前台应用检测](https://github.com/dtsykunov/pause-app/blob/d7411ef04b7c2a4c129c71815655e651988a6e76/app/src/main/java/com/dtsykunov/pause/AppMonitorService.kt) | 从无障碍窗口事件识别目标应用，并在展示前再次核对前台应用。 | 可直接用成品体验打开应用时的停顿。源码适合参考前台识别；要实现「仅在本轮 AI 等待时出现」，还需要经配对的任务状态。 |
| [Are You Sure? · iOS 拦截按钮](https://github.com/anthonycaccese/are-you-sure-ios/blob/a9672bdef1c8fe5885fd8faec8cc7e48196f16f3/ShieldActionExtension/ShieldActionExtension.swift) | 在系统拦截页按按钮后，保存应用标识并发本地通知，用户点击再进入主应用回答问题。 | 适合体验真实跳转的摩擦。源码采用 GPL-3.0。当前阶段先用成品比较「问一句」和「要求填写理由」对正常使用微信有什么影响。 |

目前网页小样可以独立加载。回此工作台仍保留原有模拟流程，当前小样与工作台之间尚未传递任务状态。
