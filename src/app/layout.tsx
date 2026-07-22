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
        <div className="mx-auto flex h-dvh max-h-dvh min-h-0 max-w-[430px] flex-col overflow-hidden box-border bg-gray-50 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
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
