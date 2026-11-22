"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight, CircleHelp, Coffee, Copy, Feather, History, Laptop, Leaf, Link2, LoaderCircle, Pencil, Play, RotateCcw, Smartphone, Sparkles, Sprout, Trash2, WifiOff, X } from "lucide-react";
import { useAttention } from "./lib/use-attention";

type Modal = "phone" | "connect" | "guide" | "review" | "finish" | "next" | null;
const TIME_OPTIONS = [15, 25, 45];
function clock(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

export default function Home() {
  const { state, ready, sync, now, error, clearError, dispatch, synchronize } = useAttention();
  const session = state.session;
  const [task, setTask] = useState("写完注意力产品的第一版方案");
  const [nextStep, setNextStep] = useState("先写下它要解决的一个具体问题");
  const [duration, setDuration] = useState(25);
  const [note, setNote] = useState("");
  const [waitingStyle, setWaitingStyle] = useState<"quiet" | "question">("quiet");
  const [modal, setModal] = useState<Modal>(null);
  const [phoneApp, setPhoneApp] = useState("小红书");
  const [toast, setToast] = useState("");
  const [stepDraft, setStepDraft] = useState("");
  const [noteFilter, setNoteFilter] = useState<"parked" | "all">("parked");
  const [shareLink, setShareLink] = useState("");
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const lastReady = useRef(false);
  const previousSession = useRef<string | null>(null);
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parked = state.notes.filter((item) => item.status === "parked");
  const shownNotes = noteFilter === "all" ? state.notes : parked;
  const remaining = session ? Math.min(session.mode === "break" ? 180 : session.durationMinutes * 60, (session.mode === "break" ? (session.breakEndsAt ?? now) - now : session.endsAt - now) / 1000) : duration * 60;
  const progress = session ? Math.min(1, Math.max(0, 1 - remaining / ((session.mode === "break" ? 3 : session.durationMinutes) * 60))) : 0;
  const latest = state.history[0];
  const modeLabel = !session ? "准备开始" : session.mode === "break" ? "有意休息中" : session.mode === "waiting" ? (session.aiReady ? "可以接着做了" : "等待演示中") : remaining <= 0 ? "这一段时间到了" : "把这一刻留给它";

  useEffect(() => { setShareLink(window.location.origin + "/"); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => { if (error) { setToast(error); clearError(); } }, [error]);
  useEffect(() => {
    if (session?.aiReady && !lastReady.current) setToast("等待演示结束了。准备好时，接着做刚才的下一步。");
    lastReady.current = session?.aiReady ?? false;
  }, [session?.aiReady]);
  useEffect(() => {
    const oldId = previousSession.current;
    const newId = session?.id ?? null;
    if (oldId && oldId !== newId && (modal === "phone" || modal === "finish" || modal === "next")) {
      setModal(newId ? null : "review");
      setToast(newId ? "另一端更新了当前任务，工作台已接上。" : "这一轮已在另一端收好，念头仍然保留。");
    }
    previousSession.current = newId;
  }, [session?.id, modal]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault(); setModal(null); noteInput.current?.focus();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => dialog.current?.querySelector<HTMLElement>("button, input, textarea, a[href]")?.focus(), 50);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
      if (event.key !== "Tab") return;
      const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, textarea, a[href]") ?? []);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { window.clearTimeout(timer); document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [modal]);

  function start(event: FormEvent) {
    event.preventDefault();
    if (!task.trim()) { setToast("先写下这一轮想完成什么。"); return; }
    if (!nextStep.trim()) { setToast("写一个足够小的下一步，回来时更容易接上。"); return; }
    if (dispatch("start", { title: task, nextStep, durationMinutes: duration })) setToast("已经替你记住。现在，从那一小步开始。");
  }
  function saveNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    if (dispatch("add-note", { text: note })) { setNote(""); setToast(session ? "念头已安放。本轮结束后，再回来看看。" : "念头已安放，稍后还能找到。"); }
  }
  function returnToTask() {
    if (dispatch("resume")) { setModal(null); setToast(`接下来：${session?.nextStep || "继续刚才的任务"}`); }
  }
  function openPhone(app: string) {
    if (!session) { setToast("先开始一轮，再体验手机上的提醒。"); return; }
    if (session.mode === "break") { setToast("现在是你主动选择的休息时间，可以安心休息。"); return; }
    if (dispatch("distraction")) { setPhoneApp(app); setModal("phone"); }
  }
  function beginBreak() {
    if (dispatch("break", { minutes: 3 })) { setModal(null); setToast("休息 3 分钟。回来时，这一步还在。"); }
  }
  function saveAnswer(answer: string) {
    if (!session) return;
    const sessionId = session.id;
    if (answerTimer.current) clearTimeout(answerTimer.current);
    answerTimer.current = setTimeout(() => dispatch("update-answer", { answer, sessionId }), 400);
  }
  function finish(completed: boolean) {
    if (dispatch("finish", { completed })) { setModal("review"); setToast("这一轮已收好，暂存的念头还在。"); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareLink); setToast("链接已复制。在手机上用同一账号打开即可。"); }
    catch { setToast("请长按下方链接，手动复制。"); }
  }
  const syncLabels = { connecting: "连接中", synced: "跨端已同步", saving: "正在同步", offline: "离线 · 本机已保存", local: "保存在本机" };

  return <div className="app-shell" data-mode={session?.mode ?? "idle"}>
    <aside className="sidebar">
      <a href="/" className="brand" aria-label="回此工作台"><span className="brand-mark"><Sprout size={25} strokeWidth={1.6} /></span><span><span className="brand-name">回此<span className="brand-english">huici</span></span><span className="brand-tag">把注意力还给自己</span></span></a>
      <div className="side-nav"><span className="section-label nav-section">你的空间</span>
        <button className="nav-item active" onClick={() => { setModal(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Leaf size={18} />此刻工作台<span className="nav-active-dot" /></button>
        <button className="nav-item" onClick={() => { noteInput.current?.scrollIntoView({ behavior: "smooth", block: "center" }); noteInput.current?.focus({ preventScroll: true }); }}><Feather size={18} />暂存的念头<span className="nav-count">{parked.length}</span></button>
        <button className="nav-item" onClick={() => setModal("review")}><History size={18} />每一小段<span className="nav-count">{state.history.length}</span></button>
        <span className="section-label nav-section second">一起试试看</span>
        <button className="nav-item" onClick={() => setModal("connect")}><Smartphone size={18} />连接另一台设备<ArrowUpRight size={14} className="nav-end" /></button>
        <button className="nav-item" onClick={() => setModal("guide")}><CircleHelp size={18} />关于这个实验</button>
      </div>
      <div className="sidebar-footer"><div className="sidebar-illustration" aria-hidden="true"><span className="plant-line" /><Leaf className="plant-leaf one" size={30} strokeWidth={1} /><Leaf className="plant-leaf two" size={23} strokeWidth={1} /><span className="plant-ground" /></div><p className="sidebar-quote">不必抓住所有念头。<br />先照顾好，眼前这一件。</p><div className="sidebar-profile"><span className="avatar">此</span><span>给自己的空间<small>慢一点，也在往前</small></span><span className="version-tag">DEMO</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><span className="mobile-brand"><Sprout size={22} />回此</span><span className="desktop-breadcrumb">我的空间<ChevronRight size={13} />此刻</span></div><div className="header-actions"><button className={`sync-status ${sync}`} onClick={() => setModal("connect")} title="查看保存与同步状态">{sync === "saving" || sync === "connecting" ? <LoaderCircle size={13} className="spin" /> : sync === "offline" ? <WifiOff size={13} /> : <span className="status-dot" />}{syncLabels[sync]}</button><button className="icon-button" aria-label="查看本轮回顾" onClick={() => setModal("review")}><History size={18} /></button><button className="icon-button" aria-label="体验指南" onClick={() => setModal("guide")}><CircleHelp size={18} /></button></div></header>
      <main className="main-content">
        <section className="intro"><div className="eyebrow"><span className="eyebrow-line" />A LITTLE SPACE FOR YOUR ATTENTION</div><div className="intro-heading-row"><h1 className="intro-title">此刻，只做这一件。</h1><span className="date-label" suppressHydrationWarning>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Shanghai" }).format(now)}</span></div><p className="intro-copy">记下想做的，安放突然想到的。走神以后，轻轻回来。</p></section>
        <div className="workspace-grid">
          <section className="focus-card" aria-labelledby="focus-heading"><div className="card-top"><h2 id="focus-heading" className="section-label"><span className="tiny-ring" />当前这一件事</h2><span className={`session-status ${session?.mode ?? "idle"}`}><span className="status-dot" />{modeLabel}</span></div>
            {!session ? <form className="task-form" onSubmit={start}>
              <label className="field-label" htmlFor="task">这一小段时间，你想完成什么？</label><textarea id="task" className="task-input" rows={2} maxLength={160} value={task} onChange={(event) => setTask(event.target.value)} placeholder="例如：写完方案的第一部分" required />
              <label className="field-label next-label" htmlFor="next-step"><ArrowDownLeft size={14} />回来以后，从这里接上</label><input id="next-step" className="next-input" maxLength={240} value={nextStep} onChange={(event) => setNextStep(event.target.value)} placeholder="写一个足够小的下一步" required />
              <div className="duration-row"><span className="muted">留一段时间</span><div className="duration-options" role="group" aria-label="本轮时长">{TIME_OPTIONS.map((minutes) => <button key={minutes} className={`duration-option ${duration === minutes ? "active" : ""}`} type="button" aria-pressed={duration === minutes} onClick={() => setDuration(minutes)}>{minutes}<span>分钟</span></button>)}</div></div>
              <button className="primary-button start-button" type="submit" disabled={!ready}><Play size={16} fill="currentColor" />开始这一刻<ArrowRight size={17} /></button><p className="form-footnote">上面是一份示例，改成你自己的事就好。</p>
            </form> : <div className="active-session"><h3 className="session-task">{session.title}</h3><div className="timer-wrap"><svg className="timer-orbit" viewBox="0 0 224 224" aria-hidden="true"><circle className="timer-track" cx="112" cy="112" r="102" /><circle className="timer-progress" cx="112" cy="112" r="102" strokeDasharray={640.9} strokeDashoffset={640.9 * progress} /><circle className="timer-inner" cx="112" cy="112" r="89" /></svg><div className="timer-core"><span className="timer-caption">{session.mode === "break" ? "安心歇一会儿" : remaining <= 0 ? "可以收个尾了" : "给眼前这件事"}</span><span className="timer-value" role="timer" aria-label={`本轮剩余 ${clock(remaining)}`}>{clock(remaining)}</span><span className="timer-subtitle">{session.mode === "break" ? "回来时，思路还在这里" : "不着急，一小步就好"}</span></div></div><div className="next-step-card"><div><span className="next-step-label"><ArrowDownLeft size={13} />你的下一小步</span><p className="next-step-text">{session.nextStep || "接着做眼前的这一件事"}</p></div><button className="icon-button" aria-label="修改下一步" onClick={() => { setStepDraft(session.nextStep); setModal("next"); }}><Pencil size={15} /></button></div><div className="session-actions">{session.mode === "break" ? <button className="primary-button" onClick={returnToTask}><ArrowLeft size={16} />我准备好回来了</button> : <button className="secondary-button" onClick={beginBreak}><Coffee size={16} />休息一下</button>}<button className="text-button" onClick={() => setModal("finish")}><CheckCheck size={16} />结束这一轮</button></div></div>}
          </section>
          <section className="thoughts-card" aria-labelledby="thoughts-heading"><div className="thoughts-head"><h2 id="thoughts-heading" className="thoughts-title"><Feather size={18} strokeWidth={1.5} />念头，先放这里</h2><span className="thoughts-count">{parked.length.toString().padStart(2, "0")}</span></div><p className="thoughts-intro">不用现在处理，也不会忘记。</p><form className="thought-entry" onSubmit={saveNote}><label className="sr-only" htmlFor="thought">暂存一个念头</label><textarea id="thought" ref={noteInput} value={note} onChange={(event) => setNote(event.target.value)} placeholder="突然想到什么？一句话就好…" rows={3} maxLength={500} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); saveNote(event); } }} /><div className="thought-entry-bottom"><span className="shortcut-label">⌘ / Ctrl + Enter</span><button className="thought-save" type="submit" disabled={!note.trim()} aria-label="暂存念头"><ArrowDownLeft size={17} />暂存</button></div></form><div className="thought-list-header"><span className="section-label">{noteFilter === "all" ? "所有念头" : "等这一轮结束再看"}</span>{state.notes.length > parked.length && <button className="text-button" onClick={() => setNoteFilter(noteFilter === "all" ? "parked" : "all")}>{noteFilter === "all" ? "只看待处理" : "查看全部"}</button>}</div><div className="thought-list">{shownNotes.length ? shownNotes.map((item) => <article className={`thought-item ${item.status}`} key={item.id}><p className="thought-text">{item.text}</p><div className="thought-meta"><span>{item.status === "done" ? "已处理" : item.status === "later" ? "留到以后" : new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }).format(item.createdAt)}</span><div className="thought-controls"><button className="icon-button" aria-label={`标记已处理：${item.text}`} onClick={() => dispatch("update-note", { id: item.id, status: item.status === "done" ? "parked" : "done" })}><Check size={13} /></button><button className="icon-button" aria-label={`删除念头：${item.text}`} onClick={() => dispatch("delete-note", { id: item.id })}><Trash2 size={12} /></button></div></div></article>) : <div className="empty-thoughts"><div className="empty-thoughts-art" aria-hidden="true"><Feather size={30} strokeWidth={1} /><span /><span /></div><p>脑海里新开的窗口，<br />可以先停在这里。</p></div>}</div><p className="thoughts-hint"><span className="tiny-ring" />本轮结束后，一起看看它们。<span className="keyboard-tip">Alt + N 快速记录</span></p></section>
        </div>
        <div className="lower-grid">
          <section className={`waiting-card ${session?.mode === "waiting" ? "is-waiting" : ""}`}><div className="feature-heading"><span className="feature-icon"><Sparkles size={18} strokeWidth={1.5} /></span><div><h2 className="feature-title">等待，也可以有个落点</h2><p className="feature-copy">AI 执行任务的空档，让思路留在这里。</p></div><span className="badge">30 秒模拟</span></div>{session?.mode === "waiting" ? <div className="waiting-active">{session.aiReady ? <><div className="waiting-ready"><span className="ready-check"><Check size={17} /></span><div><strong>等待结束了，思路还在。</strong><p>接下来：{session.nextStep || session.title}</p></div></div><button className="primary-button compact" onClick={returnToTask}>接着做下一步<ArrowRight size={15} /></button></> : <><div className="waiting-count"><span className="breathing-dot" /><span>等待演示中</span><strong>{Math.max(0, Math.ceil(((session.waitingEndsAt ?? now) - now) / 1000))}s</strong></div>{session.waitingStyle === "question" ? <div className="optional-question"><label htmlFor="answer">做完这件事，你最希望得到什么？</label><textarea id="answer" key={`${session.id}-${session.waitingEndsAt}`} defaultValue={session.questionAnswer} rows={2} maxLength={1000} placeholder="想一想也可以，留空也可以。" onChange={(event) => saveAnswer(event.target.value)} onBlur={(event) => { if (answerTimer.current) clearTimeout(answerTimer.current); if (event.target.value !== session.questionAnswer) dispatch("update-answer", { answer: event.target.value }); }} /></div> : <p className="quiet-message">可以看远处，松一下肩膀。<br /><span>回来后，先做：{session.nextStep || session.title}</span></p>}<button className="text-button" onClick={() => dispatch("wait-ready")}>跳到等待结束<ArrowRight size={13} /></button></>}</div> : <div className="waiting-options"><div className="segmented" role="group" aria-label="等待方式"><button className={`segment ${waitingStyle === "quiet" ? "active" : ""}`} aria-pressed={waitingStyle === "quiet"} onClick={() => setWaitingStyle("quiet")}><Leaf size={14} />安静等一会儿</button><button className={`segment ${waitingStyle === "question" ? "active" : ""}`} aria-pressed={waitingStyle === "question"} onClick={() => setWaitingStyle("question")}><Sparkles size={14} />留一个小问题</button></div><button className="secondary-button compact" disabled={!session || session.mode === "break"} onClick={() => dispatch("wait", { seconds: 30, style: waitingStyle })}>体验等待<ArrowUpRight size={14} /></button></div>}</section>
          <section className="phone-card"><div className="feature-heading"><span className="feature-icon"><Smartphone size={18} strokeWidth={1.5} /></span><div><h2 className="feature-title">拿起手机时，停一下</h2><p className="feature-copy">在自动打开之前，多一次自己的选择。</p></div><span className="badge">入口演示</span></div><div className="phone-apps"><button className="phone-app" onClick={() => openPhone("小红书")}><span className="app-glyph xiaohongshu red">小红书</span><span>小红书</span></button><button className="phone-app" onClick={() => openPhone("抖音")}><span className="app-glyph douyin dark">♪</span><span>抖音</span></button><button className="phone-app" onClick={() => openPhone("微信朋友圈")}><span className="app-glyph wechat"><span className="wechat-bubble" /><span className="wechat-bubble small" /></span><span>朋友圈</span></button><span className="phone-apps-line" /><p className="phone-demo-hint">点一个应用，<br />试试提醒会怎样出现。<ArrowUpRight size={14} /></p></div><p className="phone-footnote">仅模拟打开流程；网页无法拦截真实应用。</p></section>
        </div>
        <footer className="workspace-footer"><span><span className="footer-mark">↳</span>把这一刻，还给自己。</span><button className="text-button" onClick={() => setModal("guide")}>一个关于主动选择的小实验<ArrowUpRight size={12} /></button></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><span className="toast-icon"><Check size={15} /></span><span>{toast}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setToast("")}><X size={14} /></button></div>}
    {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><div className={`modal ${modal === "review" ? "review-modal" : ""} ${modal === "phone" ? "phone-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={dialog}><button className="modal-close icon-button" onClick={() => setModal(null)} aria-label="关闭窗口"><X size={20} /></button>
      {modal === "phone" && <><span className="modal-kicker"><Smartphone size={14} />手机入口模拟 · {phoneApp}</span><div className="pause-art" aria-hidden="true"><span /><Leaf size={37} strokeWidth={1.1} /></div><h2 className="modal-title" id="modal-title">先停一下。<br />这是你现在想做的吗？</h2><p className="modal-copy">你刚才，把这一小段时间留给了：</p><div className="modal-task"><span className="section-label">当前这一件事</span><strong>{session?.title}</strong><span><ArrowDownLeft size={13} />{session?.nextStep}</span></div><div className="modal-actions"><button className="choice-button recommended" onClick={returnToTask}><span className="choice-icon"><ArrowLeft size={19} /></span><span className="choice-content"><span className="choice-title">回去，接着做</span><span className="choice-detail">下一小步已经替你留好了</span></span><ArrowRight size={17} /></button><button className="choice-button" onClick={() => { setModal(null); setToast(`你选择了有意使用${phoneApp}。演示不会打开真实应用。`); }}><span className="choice-icon"><Smartphone size={18} /></span><span className="choice-content"><span className="choice-title">确实有事需要用</span><span className="choice-detail">我知道现在为什么打开它</span></span><ChevronRight size={16} /></button><button className="choice-button" onClick={beginBreak}><span className="choice-icon"><Coffee size={19} /></span><span className="choice-content"><span className="choice-title">我想主动休息一下</span><span className="choice-detail">休息 3 分钟，任务计时暂停</span></span><ChevronRight size={16} /></button></div><p className="modal-footnote">这是提醒流程演示，无法拦截或打开真实应用。<br />无须证明自己足够自律，选择权一直在你这里。</p></>}
      {modal === "connect" && <><span className="modal-kicker"><Link2 size={15} />让两台设备记住同一件事</span><h2 className="modal-title" id="modal-title">思路，可以跟着你。</h2><p className="modal-copy">在手机上打开同一个地址，用同一个 ChatGPT 账号登录。当前任务、下一步和暂存念头会自动同步。</p><div className="device-bridge"><Laptop size={42} strokeWidth={1.2} /><span className="bridge-dots">· · ·</span><span className="bridge-leaf"><Leaf size={22} /></span><span className="bridge-dots">· · ·</span><Smartphone size={33} strokeWidth={1.2} /></div><label className="field-label" htmlFor="share-link">在另一台设备打开</label><div className="sync-link"><input id="share-link" readOnly value={shareLink} onFocus={(event) => event.target.select()} /><button className="icon-button" aria-label="复制链接" onClick={copyLink}><Copy size={17} /></button></div><div className={`sync-detail ${sync}`}><span className="status-dot" /><div><strong>{syncLabels[sync]}</strong><p>{sync === "synced" ? "当前工作区已保存到你的私有账号，页面打开时约每 4 秒更新。" : sync === "saving" ? "正在保存最新变化，稍后会自动更新状态。" : sync === "offline" ? "连接中断，变化已保存在此浏览器；恢复连接后会继续尝试同步。" : "你可以直接体验。本机数据会保留；登录后可启用跨设备同步。"}</p></div></div><div className="button-row">{sync === "local" && <a className="primary-button" href="/signin-with-chatgpt?return_to=/" target="_top">登录并连接设备<ArrowUpRight size={15} /></a>}<button className="secondary-button" onClick={() => { void synchronize(); setToast("正在重新检查同步状态。"); }}><RotateCcw size={15} />重新检查</button></div><p className="modal-footnote">跨端共享的是你的任务和念头；系统级应用拦截仍是模拟。</p></>}
      {modal === "guide" && <><span className="modal-kicker"><Sprout size={16} />回此 · 一个可以亲手试的想法</span><h2 className="modal-title" id="modal-title">走神以后，<br />也有回来的路。</h2><p className="modal-copy">这里不评判你分心了几次。我们想试试：在切换之前，想起原本的意图；切换之后，更容易接上。</p><div className="guide-list">{[["01", "留下一件事", "写下想完成的结果，再写一个足够小的下一步。"], ["02", "给念头一个位置", "突然想到别的，一句话暂存；这一轮结束后一起看。"], ["03", "亲手试一次切换", "体验 30 秒模拟等待，或点开手机应用入口演示。"], ["04", "带着线索回来", "选择回来、主动休息或有意使用，最后看看这一轮的真实记录。"]].map(([number, title, copy]) => <div className="guide-step" key={number}><span>{number}</span><div><strong>{title}</strong><p>{copy}</p></div></div>)}</div><div className="guide-boundary"><strong>这份 demo 能做到什么</strong><p>任务计时、念头保存、同账号跨端同步与流程演示可以操作。AI 回答生成和系统级应用拦截尚未接入。计时记录不能测量你的实际注意力。</p></div><button className="primary-button" onClick={() => setModal(null)}>回到此刻<ArrowRight size={16} /></button></>}
      {modal === "next" && <form onSubmit={(event) => { event.preventDefault(); if (dispatch("update-next-step", { nextStep: stepDraft })) { setModal(null); setToast("下一小步已经更新。"); } }}><span className="modal-kicker"><Pencil size={14} />替回来时的自己留个线索</span><h2 className="modal-title" id="modal-title">接下来，从哪里开始？</h2><label className="field-label" htmlFor="edit-step">越具体，越容易接上</label><textarea id="edit-step" className="inline-input" rows={3} value={stepDraft} onChange={(event) => setStepDraft(event.target.value)} maxLength={240} placeholder="例如：回到第三段，先补一个具体例子" required /><button className="primary-button" type="submit">留好这一步<Check size={16} /></button></form>}
      {modal === "finish" && <><span className="modal-kicker"><CheckCheck size={16} />收好这一小段时间</span><h2 className="modal-title" id="modal-title">这一轮，进展如何？</h2><div className="modal-task"><strong>{session?.title}</strong></div><p className="modal-copy">暂存的念头会一起保留。无论完成多少，都可以在这里停下。</p><div className="modal-actions"><button className="choice-button recommended" onClick={() => finish(true)}><CheckCheck size={21} /><span className="choice-content"><span className="choice-title">完成了原本想做的</span><span className="choice-detail">收好这一轮，看看暂存的念头</span></span><ArrowRight size={17} /></button><button className="choice-button" onClick={() => finish(false)}><Leaf size={21} /><span className="choice-content"><span className="choice-title">还没完成，先到这里</span><span className="choice-detail">保留进展，稍后可以再开始</span></span><ChevronRight size={17} /></button></div></>}
      {modal === "review" && <><span className="modal-kicker"><History size={15} />每一小段，都有去处</span><h2 className="modal-title" id="modal-title">{latest ? "收好这一轮，也看看念头。" : "从第一小段时间开始。"}</h2>{latest ? <><div className="review-session"><span className="badge">{latest.completed ? "已完成" : "先到这里"}</span><h3>{latest.title}</h3><p>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }).format(latest.endedAt)}</p></div><div className="review-stats"><div className="review-stat"><strong>{clock(latest.focusedSeconds)}</strong><span>本轮计时 · 不含休息</span></div><div className="review-stat"><strong>{latest.returnCount}<small> 次</small></strong><span>主动回到任务</span></div><div className="review-stat"><strong>{latest.notesCount}<small> 个</small></strong><span>安放的念头</span></div></div><p className="review-measure-note">计时与操作来自本轮实际记录，不代表对注意力的测量。</p></> : <p className="modal-copy">开始并结束一轮后，这里会留下真实记录。你现在也可以整理暂存的念头。</p>}<div className="review-notes"><h3>现在，再看看刚才想到的</h3>{state.notes.filter((item) => item.status !== "done").length ? state.notes.filter((item) => item.status !== "done").map((item) => <div className="review-note" key={item.id}><p>{item.text}</p><div className="button-row"><button className="text-button" onClick={() => { if (session) { setToast("先结束当前任务，再开始另一件事。"); return; } setTask(item.text); setNextStep(""); setModal(null); setToast("已放到下一轮。补一个下一小步，就可以开始。"); }}><Play size={12} />接下来做</button><button className="text-button" onClick={() => dispatch("update-note", { id: item.id, status: item.status === "later" ? "parked" : "later" })}>{item.status === "later" ? <Check size={12} /> : <History size={12} />}{item.status === "later" ? "已留到以后" : "留到以后"}</button><button className="text-button" onClick={() => dispatch("delete-note", { id: item.id })}><Trash2 size={12} />放下它</button></div></div>) : <p className="muted">没有待处理的念头，安心开始下一件事。</p>}</div>{state.history.length > 1 && <details className="past-sessions"><summary>之前的 {state.history.length - 1} 小段时间</summary>{state.history.slice(1).map((item) => <div className="past-session" key={item.id}><span>{item.title}</span><small>{clock(item.focusedSeconds)} · {item.completed ? "已完成" : "先到这里"}</small></div>)}</details>}<button className="primary-button" onClick={() => setModal(null)}>回到工作台<ArrowRight size={16} /></button></>}
    </div></div>}
  </div>;
}
