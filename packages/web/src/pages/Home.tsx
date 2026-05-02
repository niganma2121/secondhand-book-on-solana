import { useState } from "react"
import { Search, SlidersHorizontal, TrendingUp } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import BookCard from "@/components/common/BookCard"
import BookCardSkeleton from "@/components/common/BookCardSkeleton"
import {
    mockBooks,
    categories,
    fixtureHomeHeroStats,
} from "@/fixtures"
import { cn } from "@/lib/utils"

export default function Home() {
    const [activeCategory, setActiveCategory] = useState("全部")
    const [loading] = useState(false)

    const filtered = activeCategory === "全部"
        ? mockBooks
        : mockBooks.filter(b => b.category === activeCategory)

    return (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">

            {/* 移动端搜索栏 */}
            <div className="md:hidden mb-5">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="搜索书名、作者、ISBN…"
                        className="pl-10 bg-secondary/50 border-border/50 focus-visible:ring-primary/30"
                    />
                </div>
            </div>

            {/* Hero 区域 */}
            <div className="relative mb-8 py-6 rounded-2xl overflow-hidden border border-primary/10 bg-gradient-to-br from-primary/5 via-card to-card">
                {/* 背景光晕 */}
                <div className="absolute top-0 left-1/4 w-64 h-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 right-1/4 w-48 h-48 rounded-full bg-primary/3 blur-2xl pointer-events-none" />

                <div className="relative px-6 md:px-8">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
                        <span className="text-xs text-primary tracking-widest uppercase">链上交易 · 安全可信</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-2 leading-snug">
                        在这里找到你的<br className="md:hidden" />
                        <span className="text-primary text-breathe">下一本好书</span>
                    </h1>
                    <p className="text-sm text-muted-foreground max-w-md">
                        二手教材交易平台，所有交易记录上链，公开透明，买卖双方共同见证
                    </p>

                    <div className="flex items-center gap-4 mt-5">
                        <div className="text-center">
                            <p className="font-mono text-lg font-medium text-primary">
                                {fixtureHomeHeroStats.listings.toLocaleString()}
                            </p>
                            <p className="text-[11px] text-muted-foreground">在售书籍</p>
                        </div>
                        <div className="w-px h-8 bg-border/60" />
                        <div className="text-center">
                            <p className="font-mono text-lg font-medium text-foreground/80">
                                {fixtureHomeHeroStats.totalTrades.toLocaleString()}
                            </p>
                            <p className="text-[11px] text-muted-foreground">累计交易</p>
                        </div>
                        <div className="w-px h-8 bg-border/60" />
                        <div className="text-center">
                            <p className="font-mono text-lg font-medium text-foreground/80">
                                {fixtureHomeHeroStats.activeUsers.toLocaleString()}
                            </p>
                            <p className="text-[11px] text-muted-foreground">活跃用户</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 分类 + 筛选 */}
            <div className="flex items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={cn(
                                "shrink-0 px-3 py-1.5 rounded-lg text-sm transition-all duration-200",
                                activeCategory === cat
                                    ? "bg-primary/15 text-primary border border-primary/30"
                                    : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
                <Button variant="ghost" size="sm" className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground h-8">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline text-sm">筛选</span>
                </Button>
            </div>

            {/* 热门推荐标题 */}
            <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-medium text-foreground/80">
                    {activeCategory === "全部" ? "最新上架" : activeCategory}
                </h2>
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground border-border/50 ml-1">
                    {filtered.length}
                </Badge>
            </div>

            {/* 书籍网格 */}
            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <BookCardSkeleton key={i} />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                    {filtered.map((book, i) => (
                        <BookCard
                            key={book.id}
                            book={book}
                            className="fade-up"
                            style={{ animationDelay: `${i * 60}ms` }}
                        />
                    ))}
                </div>
            )}

            {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <p className="text-sm">该分类暂无书籍</p>
                </div>
            )}
        </div>
    )
}