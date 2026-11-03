import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CarCare",
  description: "자동차 관리 웹 서비스 CarCare",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
