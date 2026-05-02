import { useParams, Link } from "react-router-dom"
import { ArrowLeft, Heart, MessageCircle, ShoppingCart, Star, Shield, Hash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { mockBooks } from "@/fixtures"
import { formatPrice, shortAddress } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { BookOpen } from "lucide-react"

const conditionConfig = {
    new:      { label: "全新", className: "bg-primary/15 text-primary border-primary/20" },
    like_new: { label: "近新", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    good:     { label: "良好", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    fair:     { label: "一般", className: "bg-muted text-muted-foreground border-border" },
}

export default function BookDetail() {
    const { id } = useParams()
    const book = mockBooks.find(b => b.id === id) ?? mockBooks[0]
    const cond = conditionConfig[book.condition]

    return (
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">
            {/* 返回 */}
            <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground mb-6 -ml-2">
                <Link to="/">
                    <ArrowLeft className="w-4 h-4" />
                    返回
                </Link>
            </Button>

            <div className="grid md:grid-cols-[280px_1fr] gap-8">
                {/* 封面 */}
                <div className="space-y-3">
                    <div className="aspect-[3/4] rounded-xl border border-border/50 bg-muted/50 flex items-center justify-center overflow-hidden card-glow">
                        {book.images[0] ? (
                            <img src={book.images[0]} alt={book.title} className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex flex-col items-center gap-3 text-muted-foreground/30">
                                <BookOpen className="w-16 h-16" />
                                <span className="text-xs">暂无封面</span>
                            </div>
                        )}
                    </div>

                    {/* 链上信息 */}
                    <div className="rounded-lg border border-border/50 bg-card p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Shield className="w-3 h-3 text-primary" />
                            <span>链上信息</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Hash className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="font-mono text-[11px] text-muted-foreground truncate">
                0xabcdef1234567890abcdef
              </span>
                        </div>
                    </div>
                </div>

                {/* 详情 */}
                <div className="space-y-5 fade-up">
                    <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <h1 className="text-xl font-semibold text-foreground leading-snug">{book.title}</h1>
                            <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0 text-muted-foreground hover:text-primary">
                                <Heart className={cn("w-4 h-4", book.isFavorited && "fill-primary text-primary")} />
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">{book.author} · {book.publisher}</p>
                    </div>

                    {/* 价格区域 */}
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex items-baseline gap-3">
              <span className="font-mono text-2xl font-semibold text-primary">
                {formatPrice(book.price)}
              </span>
                            <span className="text-sm text-muted-foreground line-through">
                原价 ¥{book.originalPrice}
              </span>
                        </div>
                        <Badge variant="outline" className={cn("mt-2 text-xs", cond.className)}>
                            {cond.label}
                        </Badge>
                    </div>

                    {/* 描述 */}
                    <div>
                        <h3 className="text-sm font-medium text-foreground/80 mb-2">书况描述</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{book.description}</p>
                    </div>

                    <Separator className="bg-border/50" />

                    {/* 卖家信息 */}
                    <div>
                        <h3 className="text-sm font-medium text-foreground/80 mb-3">卖家信息</h3>
                        <div className="flex items-center gap-3">
                            <Avatar className="w-9 h-9 border border-border/50">
                                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                    {book.seller.nickname?.[0] ?? "W"}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">
                                    {book.seller.nickname ?? shortAddress(book.seller.address)}
                                </p>
                                <div className="flex items-center gap-1 mt-0.5">
                                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                    <span className="text-xs text-muted-foreground">
                    {book.seller.rating} · 已售 {book.seller.soldCount} 本
                  </span>
                                </div>
                            </div>
                            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 border-border/60 hover:border-primary/40 hover:text-primary">
                                <Link to={`/messages/${book.seller.id}`}>
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    联系
                                </Link>
                            </Button>
                        </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-3 pt-2">
                        <Button
                            className="flex-1 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 breathe"
                            onClick={() => console.log("购买")}
                        >
                            <ShoppingCart className="w-4 h-4" />
                            立即购买
                        </Button>
                    </div>

                    <p className="text-xs text-muted-foreground text-center">
                        通过智能合约交易，资金安全有保障
                    </p>
                </div>
            </div>
        </div>
    )
}