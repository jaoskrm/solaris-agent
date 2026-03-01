import React from 'react';
import { cn } from "../../lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    children?: React.ReactNode;
}

export function Card({ className, ...props }: CardProps) {
    return (
        <div
            className={cn(
                "rounded-xl border border-white/5 bg-black/40 backdrop-blur-xl shadow-2xl relative overflow-hidden",
                className
            )}
            {...props}
        >
            {/* Subtle top glare */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
            {props.children}
        </div>
    );
}
