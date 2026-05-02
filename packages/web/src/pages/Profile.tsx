import { Settings, BookOpen, ShoppingBag, Star, ExternalLink, Copy, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { mockUser, mockBooks } from "@/fixtures"
import BookCard from "@/components/common/BookCard"

export default function Profile() {
    return (
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-6">
            {/* 个人信息卡 */}
            <div className="relative rounded-2xl border border-border/50 bg-card overflow-hidden mb-6 fade-up">
                {/* 背景光晕 */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />

                <div className="relative p-5">
                    <div className="flex items-start justify-between mb-4">
                        <Avatar className="w-16 h-16 border-2 border-primary/30 breathe">
                            <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                                {mockUser.nickname?.[0] ?? "W"}
                            </AvatarFallback>
                        </Avatar>
                        <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground">
                            <Settings className="w-4 h-4" />
                        </Button>
                    </div>

                    <h2 className="text-lg font-semibold text-foreground">{mockUser.nickname}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{mockUser.school}</p>

                    {/* 钱包地址 */}
                    <div className="flex items-center gap-2 mt-3 bg-secondary/50 rounded-lg px-3 py-2 border border-border/40">
                        <Wallet className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-mono text-xs text-muted-foreground flex-1">{mockUser.address}</span>
                        <button
                            onClick={() => navigator.clipboard.writeText(mockUser.address)}
                            className="text-muted-foreground hover:text-primary transition-colors"
                        >
                            <Copy className="w-3 h-3" />
                        </button>
                    </div>

                    {/* 统计 */}
                    <div className="grid grid-cols-3 gap-3 mt-4">
                        {[
                            { icon: BookOpen, value: mockUser.listingsCount, label: "在售" },
                            { icon: ShoppingBag, value: mockUser.soldCount, label: "已售" },
                            { icon: Star, value: mockUser.rating, label: "评分" },
                        ].map(({ icon: Icon, value, label }) => (
                            <div key={label} className="text-center rounded-lg bg-secondary/30 py-2.5">
                                <p className="font-mono text-base font-medium text-foreground">{value}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 我的在售 */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-foreground/80">我的在售</h3>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 h-7">
                        查看全部 <ExternalLink className="w-3 h-3" />
                    </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {mockBooks.slice(0, 3).map((book, i) => (
                        <BookCard
                            key={book.id}
                            book={book}
                            className="fade-up"
                            style={{ animationDelay: `${i * 80}ms` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}