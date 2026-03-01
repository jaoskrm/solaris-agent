import { motion } from 'motion/react';
import { Shield } from 'lucide-react';

export function Landing() {
    return (
        <main className="relative z-10 flex flex-col items-center justify-center min-h-[85vh] px-4 text-center">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-5xl mx-auto flex flex-col items-center"
            >
                <Shield className="w-12 h-12 text-white mb-8" />

                <h1 className="text-6xl md:text-8xl lg:text-[110px] font-serif tracking-tight leading-[0.95] mb-8">
                    Security for <br className="hidden md:block" /> AI-generated code
                </h1>

                <div className="flex flex-wrap justify-center gap-4 md:gap-8 text-[10px] md:text-xs font-mono text-gray-400 tracking-[0.2em] uppercase mb-8">
                    <span>#1 IN VULNERABILITY DETECTION</span>
                    <span>KNOWLEDGE GRAPH ANALYSIS</span>
                    <span>ZERO COST LOCAL-FIRST</span>
                </div>

                <p className="text-lg md:text-xl text-gray-400 max-w-2xl mb-12 font-light leading-relaxed">
                    VibeCheck uses Knowledge Graph analysis and AI agents to find vulnerabilities that linters miss.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4 mb-24">
                    <button className="px-6 py-3 bg-white text-black text-sm font-medium rounded-full hover:bg-gray-200 transition-colors flex items-center gap-2">
                        Start Scanning
                    </button>
                    <button className="px-6 py-3 bg-transparent border border-gray-500 text-white text-sm font-medium rounded-full hover:bg-white/10 transition-colors flex items-center gap-2">
                        View demo
                    </button>
                </div>

                {/* Social Proof / Example Repos */}
                <div className="w-full max-w-4xl mt-12">
                    <div className="flex flex-wrap justify-center items-center gap-10 md:gap-20 opacity-40 hover:opacity-100 transition-opacity duration-500">
                        <span className="text-xl md:text-2xl font-bold font-sans tracking-tighter text-gray-300">Juice Shop</span>
                        <span className="text-xl md:text-2xl font-bold font-serif italic text-gray-300">DVWA</span>
                        <span className="text-xl md:text-2xl font-bold font-mono text-gray-300">NodeGoat</span>
                        <span className="text-xl md:text-2xl font-bold font-sans tracking-widest text-gray-300">WebGoat</span>
                    </div>
                </div>
            </motion.div>
        </main>
    );
}
