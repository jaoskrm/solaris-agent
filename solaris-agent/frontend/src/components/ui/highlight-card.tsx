

import { FC, ReactNode, memo } from "react";

interface ComponentProps {
  title: string;
  description: string[];
  icon?: ReactNode;
}

const Component: FC<ComponentProps> = memo(({ title, description, icon }) => {
  return (
    <div className="group cursor-pointer transition-transform duration-500 hover:scale-[1.02] hover:-rotate-1 h-full will-change-transform">
      <div className="text-white rounded-2xl border border-white/10 bg-gradient-to-br from-[#010101] via-[#090909] to-[#010101] shadow-2xl relative backdrop-blur-xl overflow-hidden hover:border-white/25 hover:shadow-white/5 hover:shadow-3xl w-full h-full transition-colors duration-500">

        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/10 opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
          <div className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full bg-gradient-to-tr from-white/10 to-transparent blur-3xl animate-glow-pulse group-hover:opacity-60 transition-opacity duration-700" />
          <div className="absolute top-10 left-10 w-16 h-16 rounded-full bg-white/5 blur-xl animate-glow-breathe" />
          <div className="absolute bottom-16 right-16 w-12 h-12 rounded-full bg-white/5 blur-lg animate-glow-breathe" style={{ animationDelay: "1s" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-full group-hover:-translate-x-[200%] transition-transform duration-1000" />
        </div>

        <div className="p-8 relative z-10 flex flex-col items-center text-center h-full">
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-glow-pulse" />
            <div className="absolute inset-0 rounded-full border border-white/10 animate-glow-breathe" />

            <div className="p-6 rounded-full backdrop-blur-lg border border-white/20 bg-gradient-to-br from-black/80 to-black/60 shadow-2xl group-hover:rotate-12 group-hover:scale-110 transition-transform duration-500 hover:shadow-white/20">
              <div className="group-hover:rotate-180 transition-transform duration-700">
                {icon}
              </div>
            </div>
          </div>

          <h3 className="mb-4 text-2xl font-bold bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-transparent group-hover:scale-105 transition-transform duration-300">
            {title}
          </h3>

          <div className="space-y-1 max-w-sm flex-1">
            {description.map((line, idx) => (
              <p
                key={idx}
                className="text-gray-400 text-sm leading-relaxed group-hover:text-gray-200 transition-colors duration-300"
              >
                {line}
              </p>
            ))}
          </div>

          <div className="mt-6 w-1/3 h-0.5 bg-gradient-to-r from-transparent via-white to-transparent rounded-full group-hover:w-1/2 group-hover:h-1 transition-all duration-500" />

          <div className="flex space-x-2 mt-4 opacity-60 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-2 h-2 bg-white rounded-full animate-glow-pulse" />
            <div className="w-2 h-2 bg-white rounded-full animate-glow-pulse" style={{ animationDelay: "0.3s" }} />
            <div className="w-2 h-2 bg-white rounded-full animate-glow-pulse" style={{ animationDelay: "0.6s" }} />
          </div>
        </div>

        <div className="absolute top-0 left-0 w-20 h-20 bg-gradient-to-br from-white/10 to-transparent rounded-br-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="absolute bottom-0 right-0 w-20 h-20 bg-gradient-to-tl from-white/10 to-transparent rounded-tl-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </div>
    </div>
  );
});

Component.displayName = "HighlightCard";

export default Component;
