import React from "react";
import { motion } from "motion/react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  name: string;
  icon: LucideIcon;
  onClick?: () => void;
  isActive?: boolean;
}

interface NavBarProps {
  items: NavItem[];
  activeTab: string;
  onTabChange: (name: string) => void;
  className?: string;
  swarmTheme?: boolean;
}

export function NavBar({ items, activeTab, onTabChange, className, swarmTheme }: NavBarProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.name;

        return (
          <motion.button
            key={item.name}
            onClick={() => {
              onTabChange(item.name);
              item.onClick?.();
            }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className={cn(
              "relative px-3 py-2 text-sm font-medium transition-colors duration-200 rounded-full flex items-center gap-1.5",
              isActive
                ? swarmTheme
                  ? "text-[#d69a7c] backdrop-blur-md border border-[rgba(214,154,124,0.25)] shadow-[inset_0_1px_0_rgba(214,154,124,0.1),0_8px_16px_rgba(0,0,0,0.4)]"
                  : "text-white bg-[rgba(0,0,0,0.5)] backdrop-blur-md border border-[rgba(255,255,255,0.15)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_16px_rgba(0,0,0,0.4)]"
                : swarmTheme
                  ? "text-[#71717a] hover:text-[#a1a1aa] border border-transparent"
                  : "text-gray-400 hover:text-gray-200 border border-transparent"
            )}
            style={isActive && swarmTheme ? { background: 'rgba(214,154,124,0.08)' } : undefined}
            aria-current={isActive ? 'page' : undefined}
            aria-label={`Navigate to ${item.name}`}
          >
            {isActive && (
              <>
                <motion.div
                  layoutId="tubelight-bg"
                  className={cn(
                    "absolute inset-0 rounded-full",
                    swarmTheme ? "bg-[rgba(214,154,124,0.06)]" : "bg-white/10"
                  )}
                  transition={{
                    type: "spring",
                    duration: 0.18,
                    bounce: 0.05,
                  }}
                />

                <motion.div
                  layoutId="tubelight-bar"
                  className={cn(
                    "absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full",
                    swarmTheme ? "bg-[#d69a7c]" : "bg-white"
                  )}
                  transition={{
                    type: "spring",
                    duration: 0.18,
                    bounce: 0.05,
                  }}
                />

                <motion.div
                  layoutId="tubelight-glow"
                  className={cn(
                    "absolute -top-1 left-1/2 -translate-x-1/2 w-12 h-4 rounded-full blur-md",
                    swarmTheme ? "bg-[rgba(214,154,124,0.3)]" : "bg-white/25"
                  )}
                  transition={{
                    type: "spring",
                    duration: 0.18,
                    bounce: 0.05,
                  }}
                />
              </>
            )}

            <span className="relative z-10" aria-hidden="true">
              <Icon size={16} strokeWidth={2} />
            </span>
            <span className="relative z-10 hidden md:inline">{item.name}</span>
          </motion.button>
        );
      })}
    </div>
  );
}