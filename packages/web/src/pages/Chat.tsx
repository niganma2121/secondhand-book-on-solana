import { useState, useRef, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { ArrowLeft, Send, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { mockUser, mockBooks } from "@/fixtures"
import { cn } from "@/lib/utils"

interface ChatMessage {
    id: string
    content: string
    isSelf: boolean
    time: string
}

const initMessages: ChatMessage[] = [
    { id: "1", content: "你好，请问《高等数学》还在吗？", isSelf: false, time: "10:28" },
    { id: "2", content: "在的，书况很好，几乎没用过", isSelf: true, time: "10:30" },
    { id: "3", content: "可以便宜一点吗", isSelf: false, time: "10:31" },
    { id: "4", content: "这个价格已经很优惠了，原价35块，现在只要0.05 ETH", isSelf: true, time: "10:32" },
]

export default function Chat() {
    const { userId } = useParams()
    const [messages, setMessages] = useState<ChatMessage[]>(initMessages)
    const [input, setInput] = useState("")
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    const send = () => {
        if (!input.trim()) return
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            content: input.trim(),
            isSelf: true,
            time: new Date().toLocaleTimeString("zh", { hour: "2-digit", minute: "2-digit" }),
        }])
        setInput("")
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] max-w-2xl mx-auto">
            {/* 顶部栏 */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-background/80 backdrop-blur shrink-0">
                <Button asChild variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground md:hidden">
                    <Link to="/messages"><ArrowLeft className="w-4 h-4" /></Link>
                </Button>
                <Avatar className="w-8 h-8 border border-border/50">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">书</AvatarFallback>
                </Avatar>
                <div>
                    <p className="text-sm font-medium">{mockUser.nickname}</p>
                    <p className="text-[11px] text-muted-foreground">在线</p>
                </div>
            </div>

            {/* 书籍引用卡 */}
            <Link
                to={`/book/${mockBooks[0].id}`}
                className="flex items-center gap-2.5 mx-4 my-3 px-3 py-2.5 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors shrink-0"
            >
                <BookOpen className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground line-clamp-1">{mockBooks[0].title}</p>
                    <p className="text-[11px] text-primary font-mono mt-0.5">0.05 ETH</p>
                </div>
            </Link>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={cn("flex items-end gap-2", msg.isSelf && "flex-row-reverse")}
                    >
                        {!msg.isSelf && (
                            <Avatar className="w-7 h-7 border border-border/50 shrink-0">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">书</AvatarFallback>
                            </Avatar>
                        )}

                        <div className={cn(
                            "max-w-[70%] px-3 py-2 rounded-2xl text-sm leading-relaxed",
                            msg.isSelf
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-card border border-border/50 text-foreground rounded-bl-sm"
                        )}>
                            {msg.content}
                        </div>

                        <span className="text-[10px] text-muted-foreground shrink-0 pb-0.5">{msg.time}</span>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* 输入框 */}
            <div className="px-4 py-3 border-t border-border/50 bg-background/80 backdrop-blur shrink-0">
                <div className="flex items-center gap-2">
                    <Input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && send()}
                        placeholder="发送消息…"
                        className="flex-1 bg-secondary/50 border-border/50 focus-visible:ring-primary/30"
                    />
                    <Button
                        size="icon"
                        onClick={send}
                        disabled={!input.trim()}
                        className="w-9 h-9 bg-primary hover:bg-primary/90 text-primary-foreground shadow-none shrink-0"
                    >
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}