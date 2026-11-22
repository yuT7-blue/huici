"""Small Windows companion for an explicitly selected Codex Desktop session."""

import json
import subprocess
import sys
import tkinter as tk
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


COLORS = {
    "paper": "#F7F7F0",
    "card": "#E9EEE2",
    "text": "#1D302A",
    "muted": "#496058",
    "accent": "#255C47",
}


class Companion:
    def __init__(self, window, filename):
        self.window = window
        self.filename = filename
        self.executor = ThreadPoolExecutor(max_workers=1)
        self.pending = None
        self.signature = None
        self.dismissed = None
        self.turn = None

        window.title("回此 · Codex")
        window.configure(bg=COLORS["paper"], padx=24, pady=20)
        window.resizable(False, False)
        window.protocol("WM_DELETE_WINDOW", self.close)
        self.label(window, "回此", 22, bold=True).pack(anchor="w")
        self.status = self.label(window, "正在连接 Codex 会话…", 10, muted=True)
        self.status.pack(anchor="w", pady=(3, 14))
        self.task = self.label(window, "", 13, bold=True)
        self.task.pack(anchor="w")

        self.card = tk.Frame(window, bg=COLORS["card"], padx=12, pady=10)
        self.label(self.card, "结果出来后，你想先核对这条请求的哪一点？", 11,
                   wrap=240, background=COLORS["card"]).pack(anchor="w")
        tk.Button(self.card, text="安静等", command=self.dismiss,
                  bg=COLORS["card"], fg=COLORS["accent"], relief="flat",
                  activebackground=COLORS["paper"], font=("Microsoft YaHei UI", 10),
                  cursor="hand2").pack(anchor="w", pady=(4, 0))
        window.update_idletasks()
        window.minsize(326, 130)
        window.geometry(f"+{max(0, window.winfo_screenwidth() - 380)}+90")
        self.refresh()

    def label(self, parent, text, size, *, bold=False, muted=False, wrap=272, background=None):
        return tk.Label(parent, text=text, font=("Microsoft YaHei UI", size, "bold" if bold else "normal"),
                        bg=background or COLORS["paper"], fg=COLORS["muted" if muted else "text"],
                        justify="left", wraplength=wrap)

    def refresh(self):
        try:
            if self.pending and self.pending.done():
                snapshot = self.pending
                self.pending = None
                self.show(snapshot.result()["latest"])
            stat = self.filename.stat()
            signature = stat.st_mtime_ns, stat.st_size
            if self.pending is None and signature != self.signature:
                self.signature = signature
                self.pending = self.executor.submit(self.read_turn)
        except (OSError, ValueError, subprocess.SubprocessError):
            self.signature = None
            self.show(None, "暂时读不到这个 Codex 会话")
        self.window.after(250 if self.pending else 1_000, self.refresh)

    def read_turn(self):
        reader = Path(__file__).with_name("desktop-turn.mjs")
        result = subprocess.run(["node", str(reader), str(self.filename), "--task"],
                                capture_output=True, encoding="utf-8", check=True, timeout=10,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        return json.loads(result.stdout)

    def show(self, turn, message=None):
        state = (turn or {}).get("phase")
        labels = {"running": "Codex 正在处理", "ended": "本轮已结束，回 Codex 查看",
                  "interrupted": "本轮已停止"}
        self.status.config(text=message or labels.get(state, "等待你在 Codex 提交任务"))
        self.task.config(text=(turn or {}).get("task", "") if state == "running" else "")
        self.turn = (turn or {}).get("startedAt")
        if state == "running" and len(self.task.cget("text")) >= 12 and self.turn != self.dismissed:
            self.card.pack(fill="x", pady=(12, 0))
        else:
            self.card.pack_forget()

    def dismiss(self):
        self.dismissed = self.turn
        self.card.pack_forget()

    def close(self):
        self.executor.shutdown(wait=False, cancel_futures=True)
        self.window.destroy()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("请传入要跟随的 Codex Desktop 会话记录文件。")
    window = tk.Tk()
    Companion(window, Path(sys.argv[1]))
    window.mainloop()
