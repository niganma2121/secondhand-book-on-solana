import { Link } from "react-router-dom"
import { MessageCircle, BookOpen } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import PageHeader from "@/components/common/PageHeader"
import { mockConversations } from "@/fixtures"
import { shortAddress } from "@/lib/utils"

export default function Messages() {
    return (
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-6">
            <PageHeader title="消息" />

            {mockConversations.length === 0 ? (
                <div className="flex flex-col items-center py-20 text-muted-foreground">
                    <MessageCircle className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">暂无消息</p>
                </div>
            ) : (
                <div className="space-y-1">
                    {mockConversations.map((conv) => (
                        <Link
                            key={conv.id}
                            to={`/messages/${conv.participant.id}`}
                            className="flex items-center gap-3 p-3.5 rounded-xl hover:bg-secondary/50 transition-colors group"
                        >
                            <Avatar className="w-10 h-10 border border-border/50 shrink-0">
                                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                    {conv.participant.nickname?.[0] ?? "W"}
                                </AvatarFallback>
                            </Avatar>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {conv.participant.nickname ?? shortAddress(conv.participant.address)}
                  </span>
                                    <span className="text-[11px] text-muted-foreground">
                    {new Date(conv.lastMessage.createdAt).toLocaleDateString()}
                  </span>
                                </div>

                                {conv.bookRef && (
                                    <div className="flex items-center gap-1 mb-1">
                                        <BookOpen className="w-2.5 h-2.5 text-primary" />
                                        <span className="text-[11px] text-primary line-clamp-1">{conv.bookRef.title}</span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between">
                                    <p className={`text-xs line-clamp-1 ${conv.lastMessage.read ? "text-muted-foreground" : "text-foreground"}`}>
                                        {conv.lastMessage.content}
                                    </p>
                                    {conv.unreadCount > 0 && (
                                        <Badge className="ml-2 h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground rounded-full shrink-0">
                                            {conv.unreadCount}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}