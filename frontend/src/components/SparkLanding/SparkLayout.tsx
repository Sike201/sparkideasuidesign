import { ReactNode } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import Footer from "./Footer";

interface SparkLayoutProps {
  children: ReactNode;
  showFooter?: boolean;
  showBackButton?: boolean;
  pageTitle?: string;
}

export default function SparkLayout({ 
  children, 
  showFooter = false, 
  showBackButton = true,
  pageTitle 
}: SparkLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBackClick = () => {
    const state = location.state as { from?: string } | null;
    if (state?.from) {
      navigate(state.from);
    } else {
      navigate(-1);
    }
  };
  return (
    <div className="relative min-h-screen bg-[#050505] text-neutral-400 antialiased overflow-x-hidden">
      {/* Back Button */}
      {showBackButton && location.pathname !== '/discover' && location.pathname !== '/profile' && location.pathname !== '/agents' && location.pathname !== '/funded' && !location.pathname.startsWith('/projects/') && !location.pathname.startsWith('/agents/') && (
        <motion.div
          className="absolute left-4 top-4 z-50"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <button
            onClick={handleBackClick}
            className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-orange-500/50 transition-all duration-300 flex items-center gap-2"
          >
            <span className="text-lg">←</span>
            Back
          </button>
        </motion.div>
      )}

      {/* Page Title Header */}
      {pageTitle && (
        <motion.div
          className="relative z-20 pt-16 pb-4 text-center"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
            {pageTitle}
          </h1>
          <div className="mt-3 w-24 h-0.5 bg-gradient-to-r from-orange-500 to-amber-500 mx-auto rounded-full opacity-70" />
        </motion.div>
      )}

      {/* Main Content */}
      <motion.main 
        className="relative z-10 min-h-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {children}
      </motion.main>

      {/* Optional Footer */}
      {showFooter && (
        <motion.footer 
          className="relative z-10"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <Footer />
        </motion.footer>
      )}
    </div>
  );
}
