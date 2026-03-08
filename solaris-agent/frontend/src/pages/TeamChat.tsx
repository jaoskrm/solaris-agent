import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Shield, Code2, Send, Bot, Clock, AlertCircle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { sendChatMessage } from '../lib/api';

interface Message {
    id: string;
    team: 'red' | 'blue';
    agent: string;
    content: string;
    timestamp: Date;
    isUser?: boolean;
}

// Initial mock messages for demonstration
const mockRedTeamMessages: Message[] = [
    {
        id: '1',
        team: 'red',
        agent: 'Recon',
        content: "I've mapped the full attack surface for `acme/api-server`:\n\n- 34 HTTP endpoints discovered across 12 route files\n- 3 unprotected POST endpoints missing auth middleware\n- 2 file upload endpoints without size/type validation\n- 1 WebSocket endpoint with no origin checking\n\nThe most promising targets are the unprotected endpoints. I've forwarded them to the Exploit agent.",
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
    },
    {
        id: '2',
        team: 'red',
        agent: 'Exploit',
        content: "Running SQLi probe on `/api/users?search=` now...",
        timestamp: new Date(Date.now() - 1000 * 60 * 3),
    },
];

const mockBlueTeamMessages: Message[] = [
    {
        id: '1',
        team: 'blue',
        agent: 'Linter',
        content: "Semgrep scan complete. Here's the summary:\n\n| Category | Count |\n|---|---|\n| Anti-patterns | 8 |\n| Dead code | 5 |\n| Console.log in production | 6 |\n| Missing error handling | 4 |\n\nMost issues are in `/src/controllers/` and `/src/utils/`. I'll pass the details to the Complexity Analyzer.",
        timestamp: new Date(Date.now() - 1000 * 60 * 6),
    },
    {
        id: '2',
        team: 'blue',
        agent: 'DepCheck',
        content: "Dependency audit results:\n\n- express 4.17.1 → CVE-2022-24999 (HIGH)\n- lodash 4.17.15 → CVE-2020-8203 (MEDIUM)\n- jsonwebtoken 8.5.1 → CVE-2022-23529 (CRITICAL)\n\nRecommend immediate upgrade for jwt library.",
        timestamp: new Date(Date.now() - 1000 * 60 * 4),
    },
];

function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function ChatPanel({
    team,
    title,
    icon: Icon,
    color,
    messages,
    onSendMessage,
    inputValue,
    setInputValue,
    isLoading,
    error
}: {
    team: 'red' | 'blue';
    title: string;
    icon: React.ElementType;
    color: string;
    messages: Message[];
    onSendMessage: (team: 'red' | 'blue', message: string) => void;
    inputValue: string;
    setInputValue: (value: string) => void;
    isLoading: boolean;
    error: string | null;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const placeholder = team === 'red' ? 'Ask the Red Team...' : 'Ask the Blue Team...';

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = () => {
        if (inputValue.trim()) {
            onSendMessage(team, inputValue.trim());
            setInputValue('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <Card className={`flex flex-col h-full`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b border-white/[0.06]`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-${color}-500/10`}>
                        <Icon className={`w-5 h-5 text-${color}-500`} />
                    </div>
                    <div>
                        <h3 className={`font-semibold text-${color}-400`}>{title}</h3>
                        <p className="text-xs text-gray-500">{messages.length} messages</p>
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="px-4 py-2 bg-red-950/30 border-b border-red-900/30">
                    <div className="flex items-center gap-2 text-red-400 text-xs">
                        <AlertCircle className="w-3 h-3" />
                        {error}
                    </div>
                </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[400px] max-h-[500px] scrollbar-thin">
                {messages.map((msg) => (
                    <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex flex-col ${msg.isUser ? 'items-end' : 'items-start'}`}
                    >
                        <div className={`max-w-[90%] ${msg.isUser ? 'bg-white/[0.05] border border-white/[0.06] rounded-lg' : `border-l-2 bg-transparent ${color === 'red' ? 'border-[#ff3b3b]' : 'border-[#2dffb3]'}`} p-3 backdrop-blur-md`}>
                            {!msg.isUser && (
                                <div className={`flex items-center gap-2 mb-2 text-${color}-400`}>
                                    <Bot className="w-3.5 h-3.5" />
                                    <span className="text-xs font-medium">{msg.agent}</span>
                                </div>
                            )}
                            <div className={`text-sm ${msg.isUser ? 'text-gray-200' : 'text-gray-300'} whitespace-pre-wrap font-mono leading-relaxed`}>
                                {msg.content}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-gray-600 text-[10px]">
                            <Clock className="w-3 h-3" />
                            {formatTime(msg.timestamp)}
                        </div>
                    </motion.div>
                ))}
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2 text-gray-500 text-sm"
                    >
                        <div className="flex gap-1">
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs">AI is thinking...</span>
                    </motion.div>
                )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/[0.06]">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={isLoading}
                        className="flex-1 bg-black/30 border border-white/[0.06] rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-white/[0.12] transition-colors"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isLoading}
                        className={`p-3 bg-${color}-600/80 hover:bg-${color}-500/80 disabled:bg-white/[0.04] disabled:text-gray-500 rounded-lg transition-colors backdrop-blur-sm border border-white/[0.06]`}
                    >
                        <Send className="w-4 h-4 text-white" />
                    </button>
                </div>
            </div>
        </Card>
    );
}

export function TeamChat() {
    const [redTeamMessages, setRedTeamMessages] = useState<Message[]>(mockRedTeamMessages);
    const [blueTeamMessages, setBlueTeamMessages] = useState<Message[]>(mockBlueTeamMessages);
    const [redInput, setRedInput] = useState('');
    const [blueInput, setBlueInput] = useState('');
    const [redLoading, setRedLoading] = useState(false);
    const [blueLoading, setBlueLoading] = useState(false);
    const [redError, setRedError] = useState<string | null>(null);
    const [blueError, setBlueError] = useState<string | null>(null);

    const handleSendMessage = async (team: 'red' | 'blue', content: string) => {
        const newMessage: Message = {
            id: Date.now().toString(),
            team,
            agent: 'User',
            content,
            timestamp: new Date(),
            isUser: true,
        };

        // Add user message immediately
        if (team === 'red') {
            setRedTeamMessages(prev => [...prev, newMessage]);
            setRedLoading(true);
            setRedError(null);
        } else {
            setBlueTeamMessages(prev => [...prev, newMessage]);
            setBlueLoading(true);
            setBlueError(null);
        }

        try {
            // Call the chat API with the user's message
            const response = await sendChatMessage(content, team === 'red' ? 'Commander' : 'Analyst');

            // Add AI response
            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                team,
                agent: response.agent || (team === 'red' ? 'Commander' : 'Analyst'),
                content: response.response,
                timestamp: new Date(),
                isUser: false,
            };

            if (team === 'red') {
                setRedTeamMessages(prev => [...prev, aiMessage]);
            } else {
                setBlueTeamMessages(prev => [...prev, aiMessage]);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to get response';
            if (team === 'red') {
                setRedError(errorMsg);
            } else {
                setBlueError(errorMsg);
            }
        } finally {
            if (team === 'red') {
                setRedLoading(false);
            } else {
                setBlueLoading(false);
            }
        }
    };

    return (
        <div className="w-full relative z-10 px-6 py-8 max-w-[1400px] mx-auto min-h-screen">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <h1 className="text-[2rem] font-[800] tracking-[-0.03em] text-white mb-1">Team Chat</h1>
                <p className="font-mono text-[0.7rem] text-[rgba(232,234,240,0.4)]">Communicate with Red Team and Blue Team agents</p>
            </motion.div>

            {/* Chat Panels */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
                <ChatPanel
                    team="red"
                    title="Red Team"
                    icon={Shield}
                    color="red"
                    messages={redTeamMessages}
                    onSendMessage={handleSendMessage}
                    inputValue={redInput}
                    setInputValue={setRedInput}
                    isLoading={redLoading}
                    error={redError}
                />
                <ChatPanel
                    team="blue"
                    title="Blue Team"
                    icon={Code2}
                    color="blue"
                    messages={blueTeamMessages}
                    onSendMessage={handleSendMessage}
                    inputValue={blueInput}
                    setInputValue={setBlueInput}
                    isLoading={blueLoading}
                    error={blueError}
                />
            </motion.div>
        </div>
    );
}
