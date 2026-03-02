"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  name: string;
  url: string;
  icon: LucideIcon;
}

interface NavBarProps {
  items: NavItem[];
  className?: string;
}

export function NavBar({ items, className }: NavBarProps) {
  const [activeTab, setActiveTab] = useState(items[0].name);

  return (
    <div
      className={cn(
        "fixed top-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-auto",
        className
      )}
    >
      <nav className="flex items-center gap-4 md:gap-6">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.name;

          return (
            <button
              key={item.name}
              onClick={() => setActiveTab(item.name)}
              className={cn(
                "relative px-5 py-3 text-base font-medium transition-colors flex items-center gap-2 rounded-full",
                isActive ? "text-white" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Icon size={20} strokeWidth={2.5} />
              <span className="hidden md:inline-block">{item.name}</span>
              
              {isActive && (
                <motion.div
                  layoutId="tubelight"
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center"
                  transition={{
                    type: "spring",
                    bounce: 0.2,
                    duration: 0.6,
                  }}
                >
                  <div className="w-8 h-[2px] bg-white rounded-full" />
                  <div className="absolute top-0 w-10 h-5 bg-white/20 blur-md rounded-full -z-10" />
                </motion.div>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
