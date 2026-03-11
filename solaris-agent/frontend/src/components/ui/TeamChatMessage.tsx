import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Terminal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../../lib/utils';

export interface Message {
    id: string;
    team: 'red' | 'blue';
    agent: string;
    content: string;
    timestamp: Date;
    isUser?: boolean;
}

interface TeamChatMessageProps {
    message: Message;
    index: number;
}

function getAgentStyles(agent: string, isUser?: boolean) {
    if (isUser || agent.toLowerCase() === 'user') {
        return {
            color: 'var(--foreground)',
            glow: 'rgba(255,255,255,0.1)',
            badge: 'USER',
            initials: 'USR'
        };
    }

    const agentUpper = agent.toUpperCase();
    if (agentUpper.includes('COMMANDER')) {
        return { color: 'var(--agent-commander)', glow: 'rgba(168, 85, 247, 0.3)', badge: 'COMMANDER', initials: 'CM' };
    }
    if (agentUpper.includes('ALPHA') || agentUpper.includes('RECON')) {
        return { color: 'var(--agent-alpha)', glow: 'rgba(249, 115, 22, 0.3)', badge: 'RECON', initials: 'AL' };
    }
    if (agentUpper.includes('BETA') || agentUpper.includes('SOCIAL')) {
        return { color: 'var(--agent-beta)', glow: 'rgba(239, 68, 68, 0.3)', badge: 'SOCIAL', initials: 'BE' };
    }
    if (agentUpper.includes('GAMMA') || agentUpper.includes('EXPLOIT')) {
        return { color: 'var(--agent-gamma)', glow: 'rgba(220, 38, 38, 0.3)', badge: 'EXPLOIT', initials: 'GA' };
    }

    // Default fallback (Blue team or unknown)
    return { color: 'var(--agent-blue)', glow: 'rgba(6, 182, 212, 0.3)', badge: agentUpper.length > 10 ? agentUpper.substring(0, 10) : agentUpper, initials: agent.substring(0, 2).toUpperCase() };
}

export function TeamChatMessage({ message, index }: TeamChatMessageProps) {
    // Parse thinking and response blocks
    let thinkingContent = "";
    let responseContent = message.content;

    const thinkingMatch = message.content.match(/<thinking>([\s\S]*?)<\/thinking>/i);
    if (thinkingMatch) {
        thinkingContent = thinkingMatch[1].trim();
        responseContent = message.content.replace(thinkingMatch[0], "").trim();

        // Remove wrapper response tag if it exists explicitly
        const responseMatch = responseContent.match(/<response>([\s\S]*?)<\/response>/i);
        if (responseMatch) {
            responseContent = responseMatch[1].trim();
        }
    }

    const { color, glow, badge, initials } = getAgentStyles(message.agent, message.isUser);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col w-full font-sans mb-6 last:mb-2 group"
        >
            <div
                className="relative flex flex-col md:flex-row md:items-start gap-4 p-4 rounded-xl transition-all duration-300 hover:bg-white/[0.02] hover:-translate-y-0.5"
                style={{
                    backgroundColor: 'var(--chat-card)',
                    border: `1px solid var(--chat-border)`,
                    borderLeft: `2px solid ${color}`
                }}
            >
                {/* Avatar Area */}
                <div className="flex items-center gap-3 shrink-0 md:flex-col md:w-16 md:items-center">
                    <div
                        className="w-10 h-10 rounded-full flex items-center justify-center relative overflow-hidden"
                        style={{
                            backgroundColor: message.isUser ? 'rgba(255,255,255,0.05)' : `${color}25`,
                            boxShadow: `0 0 16px ${glow}`
                        }}
                    >
                        {/* Inner background tint */}
                        <div className="absolute inset-0 opacity-15" style={{ backgroundColor: color }} />
                        <span
                            className="font-mono text-sm font-bold relative z-10"
                            style={{ color: color, textShadow: `0 0 8px ${color}` }}
                        >
                            {initials}
                        </span>
                    </div>

                    {/* Mobile Info view */}
                    <div className="md:hidden flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-white/90">{message.agent}</span>
                            <span
                                className="font-mono text-[0.6rem] px-1.5 py-0.5 rounded-sm border opacity-90 relative overflow-hidden"
                                style={{ color: color, borderColor: `${color}40`, backgroundColor: `${color}10` }}
                            >
                                [{badge}]
                            </span>
                        </div>
                        <span className="font-mono text-[0.65rem] text-white/40 mt-0.5">
                            {formatTime(message.timestamp)}
                        </span>
                    </div>
                </div>

                {/* Message Content Area */}
                <div className="flex-1 w-full min-w-0">
                    {/* Desktop Info View */}
                    <div className="hidden md:flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-white/90">{message.agent}</span>
                            <span
                                className="font-mono text-[0.6rem] px-2 py-0.5 rounded-sm border opacity-90 relative overflow-hidden"
                                style={{ color: color, borderColor: `${color}40`, backgroundColor: `${color}10` }}
                            >
                                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
                                [{badge}]
                            </span>
                        </div>
                        <span className="font-mono text-[0.65rem] text-white/40">
                            {formatTime(message.timestamp)}
                        </span>
                    </div>

                    {/* Thinking Block */}
                    {thinkingContent && (
                        <details className="group/think mb-4 marker:mt-0">
                            <summary className="flex items-center cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[#8E8E92] hover:text-[#ECECEC] transition-colors text-[0.85rem] font-sans mb-3 w-fit select-none">
                                <ChevronRight className="w-4 h-4 mr-1 transition-transform group-open/think:rotate-90" />
                                <span className="font-medium mr-3">Thought Process</span>

                                {/* Live thinking pulsing dots */}
                                <span className="flex space-x-1 items-center opacity-80 group-open/think:opacity-40 transition-opacity">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#8E8E92] animate-pulse" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#8E8E92] animate-pulse" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#8E8E92] animate-pulse" style={{ animationDelay: '300ms' }} />
                                </span>
                            </summary>
                            <div
                                className="pl-5 ml-2 border-l-[1.5px] mb-3 text-[#C1C1C4] text-[0.85rem] font-sans leading-[1.6]"
                                style={{ borderColor: `${color}40` }}
                            >
                                <ReactMarkdown
                                    components={{
                                        p({ children }) { return <p className="mb-2 last:mb-0">{children}</p> },
                                        strong({ children }) { return <strong className="text-[#ECECEC] font-semibold">{children}</strong> }
                                    }}
                                >
                                    {thinkingContent}
                                </ReactMarkdown>
                            </div>
                        </details>
                    )}

                    {/* Main Response Output */}
                    <div className="prose prose-invert max-w-none font-sans text-[0.875rem] text-white/80 leading-[1.6]">
                        <ReactMarkdown
                            components={{
                                code({ node, inline, className, children, ...props }: any) {
                                    const match = /language-(\w+)/.exec(className || '')
                                    return !inline ? (
                                        <div className="relative my-4 rounded-lg overflow-hidden group/code border border-white/10 bg-[#080B12]">
                                            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                                                <span className="font-mono text-[0.65rem] text-white/50 uppercase tracking-wider flex items-center gap-2">
                                                    <Terminal className="w-3 h-3" />
                                                    {match ? match[1] : 'TERMINAL'}
                                                </span>
                                            </div>
                                            <div className="p-4 overflow-x-auto text-[0.75rem] font-mono text-[#A1B56C]">
                                                <code className={className} {...props}>
                                                    {children}
                                                </code>
                                            </div>
                                        </div>
                                    ) : (
                                        <code className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[0.8em] text-[#86BBD8]" {...props}>
                                            {children}
                                        </code>
                                    )
                                },
                                ul({ children }) { return <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul> },
                                ol({ children }) { return <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol> },
                                p({ children }) { return <p className="mb-2 last:mb-0">{children}</p> },
                                strong({ children }) { return <strong className="font-semibold text-white/95">{children}</strong> }
                            }}
                        >
                            {responseContent}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
