# 回此 · Codex 桌面接入验证

[可选 Hook 配置示例](hooks.example.json) 注册了 `UserPromptSubmit`、`Stop`、`Interrupt` 和 `PermissionRequest`。Codex 在这些时刻调用本地 Node.js 记录器。记录按会话和轮次的组合区分，只保存哈希标记、事件类型、观察时间和是否收到任务文字。任务正文、回复正文和工具参数不会落盘，也没有网络调用。

## 在桌面端试一次

1. 若要试 Hook，将 `codex-probe/hooks.example.json` 复制到项目根目录的 `.codex/hooks.json`。已有配置时合并四个事件的处理项。从项目根目录打开 Codex，并确保 Node.js 24 在 PATH 上。打开「Review hooks / 审核 Hooks」或「设置 → Hooks」，检查并信任这组项目 Hooks。Windows 小窗可以直接读取指定会话文件。
2. 发一条可以很快答完的无敏感信息请求。再发一条需要等待的请求，处理中按停止。
3. 从项目根目录运行 `node codex-probe/record.mjs status`。预期两轮都有 `UserPromptSubmit`，前一轮有 `Stop`，后一轮有 `Interrupt`。若某个事件缺少轮次标识，会单独计入 `missingIds`。

需要进一步验收时，在本项目的两个会话分别发起任务。让一个先结束，检查看另一个是否仍只有提交事件。设置里可以随时停用这组 Hooks。

`Stop` 记录 Codex 停止响应的信号。失败原因、回答何时首次可读、审批是否真的显示在桌面端，仍需通过其它信号或现场观察确认。从子目录启动 Codex 时，可把示例中的脚本路径改为本机绝对路径。

## 直接核对一个桌面会话

`node codex-probe/desktop-turn.mjs <会话记录文件>` 从指定的 Codex Desktop JSONL 文件读取最近一轮状态。只输出轮次数、状态和时间，不写文件、展示对话或上传数据。在 Codex 的 shell 中，可以用 `CODEX_THREAD_ID` 找到本次会话的文件：

```powershell
$session = Get-ChildItem "$env:USERPROFILE/.codex/sessions" -File -Recurse -Filter "*$env:CODEX_THREAD_ID.jsonl" |
  Select-Object -First 1
node codex-probe/desktop-turn.mjs $session.FullName
```

会话文件格式可能随 Codex 版本升级而变。进程异常退出也可能只留下开始记录，因此此读取工具用于验证和诊断，手机提醒需要另外核对状态新鲜度。

## Windows 小窗

在本项目的 Codex shell 内查到 `$session` 后，运行：

```powershell
pythonw codex-probe/companion.py $session.FullName
```

小窗跟随指定会话，在会话文件变动时刷新。等待期间显示本轮请求的前 100 个字符；信息足够时显示一条固定的思考提示，可点「安静等」。本轮结束或停止时清除内容。它在本机内存中取请求片段用于显示。短消息目前按 12 个字符的门槛略过提问，后续可按试用调整。依赖 Node.js 24 和带 Tk 的 Windows Python。

用当前桌面会话验证了实际运行状态及「继续啊」请求片段。另用 Windows 小窗和构造的会话文件走通了请求出现、手动收起、新一轮恢复提示、取消后清除内容。真实桌面任务的取消仍待验证。

## 已验证

- `node --test codex-probe/record.test.mjs` 覆盖同目录并行轮次、取消、事件重复或乱序、标识缺失及正文未落盘。
- 本机 Codex 的 `hooks/list` 找到项目的四条监听，配置校验没有警告或错误，初始状态为待信任。
- 回放当前桌面会话的实际记录，按轮次匹配了 10 次完成事件，当时正在执行的一轮被单独记录。这个结果来自桌面会话日志，四个 Hook 的现场触发仍需要桌面端审核后核对。
- 2026 年 11 月 22 日复测时，Codex 已信任配置。用临时本地 App Server 会话确认提交和结束两类 Hook 进入执行，但原启动命令退出码为 1。原命令在 PowerShell 下可复现语法错误，已修正命令。变更后的命令需按 Codex 的审核流程重新信任。
- 同日直接读取当前桌面会话，看到本轮已开始且仍在执行，并识别出之前 11 轮已结束。会话文件读取器的取消与迟到事件识别通过构造记录测试，桌面会话文件中的真实取消仍待核实。
- 重新信任后，本机 Codex App Server 的真实只读任务成功记录提交和结束。另两轮在同一项目中实际并行，提交后的观察时间有约 1 秒重叠，轮次标记不同。正常完成的那轮只记录自己的 `Stop`，被主动停止的那轮只记录自己的 `Interrupt`，没有相互覆盖。
- 当前已经打开的桌面聊天仍未收到「复测」这轮对应的 Hook 事件。按实际轮次标记检查过事件目录。直接读取同一会话文件仍可识别本轮是运行中。当前桌面聊天的 Hook 触发和权限请求事件待核实。

参考 [Codex Hooks 文档](https://developers.openai.com/codex/hooks)。
