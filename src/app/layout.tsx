import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import PwaRegister from "@/components/pwa-register";
import { FontSizeProvider } from "@/features/settings/components/font-size-provider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Netra",
  description: "Netra 모바일 웹 서비스",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Netra",
    startupImage: "/icons/icon.svg",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f172a",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <body className={`${geistSans.variable} antialiased`}>
        {/* iOS PWA 뷰포트 높이 고정: dvh 불안정 문제 해결 */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            function setH(){document.documentElement.style.setProperty('--app-h',window.innerHeight+'px');}
            setH();
            window.addEventListener('resize',setH);
          })();
        `}} />
        <div className="mx-auto flex min-h-0 max-w-[430px] flex-col overflow-hidden box-border bg-white pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]" style={{height:'var(--app-h,100dvh)',maxHeight:'var(--app-h,100dvh)'}}>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Providers>
              <FontSizeProvider />
              {children}
            </Providers>
            <PwaRegister />
          </div>
        </div>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
