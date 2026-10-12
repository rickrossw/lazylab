import type { Metadata } from "next";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { AuthProvider } from "@/components/Auth";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap", weight: ["600", "700", "800"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "The LazyLab Playbook — learn to run GPU clusters", template: "%s · LazyLab" },
  description:
    "An interactive lab for GPU cluster architecture, scheduling, optimization, monitoring, performance and security. Read a concept, poke a live simulated cluster, then prove it in a mission.",
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/favicon.svg` },
};

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
        <footer className="footer">
          <div className="container">
            <p style={{ marginBottom: 8 }}>
              LazyLab is a free, open learning environment. The cluster is simulated: models are analytical and directionally
              correct, not cycle-accurate.
            </p>
            <div className="row" style={{ gap: 18 }}>
              <span>Built on the shoulders of:</span>
              <a href="https://prace-ri.eu/wp-content/uploads/Best-Practice-Guide_GPGPU.pdf">PRACE GPGPU guide</a>
              <a href="https://ttsugriy.github.io/distributed-training-book/">Distributed Training book</a>
              <a href="https://modal.com/gpu-glossary">Modal GPU Glossary</a>
              <a href="https://github.com/NVIDIA/grcuda">grCUDA</a>
              <a href="https://github.com/NVIDIA/open-gpu-kernel-modules">open-gpu-kernel-modules</a>
            </div>
          </div>
        </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
