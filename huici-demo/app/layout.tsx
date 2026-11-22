import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "回此 · 把注意力还给自己",
  description: "记住此刻想做的事，安放突然冒出的念头，走神以后，轻轻回来。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
