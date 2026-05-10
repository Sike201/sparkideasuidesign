import { Twitter, Send } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black py-12">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center">
          <img
            src="/sparklogo.png"
            alt="Spark"
            className="h-8 w-auto object-contain"
          />
        </div>
        <div className="text-xs text-neutral-600">
          © 2025 Spark Ecosystem. All rights reserved.
        </div>
        <div className="flex gap-6">
          <a
            href="https://x.com/JustSparkdotFun"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 hover:text-white transition-colors"
          >
            <Twitter className="w-4 h-4" strokeWidth="1.5" />
          </a>
          <a
            href="https://t.me/sparkdotfun"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 hover:text-white transition-colors"
          >
            <Send className="w-4 h-4" strokeWidth="1.5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
