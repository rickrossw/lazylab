import type { Metadata } from "next";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import { Footer, Nav } from "@/components/Nav";
import { AuthProvider } from "@/components/Auth";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap", weight: ["600", "700", "800"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

const SITE_URL = "https://lazylab.com";
const TITLE = "LazyLab — learn to run GPU clusters";
const DESCRIPTION =
  "Learn GPU cluster architecture, operations, optimization, monitoring, performance and security. Read, play with a live simulated cluster, clear checkpoints and beat the boss missions.";
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · LazyLab" },
  description: DESCRIPTION,
  applicationName: "LazyLab",
  manifest: `${base}/site.webmanifest`,
  icons: {
    icon: [
      { url: `${base}/favicon.ico`, sizes: "any" },
      { url: `${base}/icon-32.png`, type: "image/png", sizes: "32x32" },
      { url: `${base}/icon-192.png`, type: "image/png", sizes: "192x192" },
      { url: `${base}/favicon.svg`, type: "image/svg+xml" },
    ],
    apple: [{ url: `${base}/apple-touch-icon.png`, sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "LazyLab",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${base}/og.png`, width: 1200, height: 630, alt: "LazyLab: Run GPU clusters like you built them." }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [`${base}/og.png`] },
};

export const viewport = { themeColor: "#052b42" };

// Applies a saved theme before first paint so there's no flash.
const themeScript = `try{var t=localStorage.getItem("lazylab.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${archivo.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AuthProvider>
          <Nav />
          <main>{children}</main>
        <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
