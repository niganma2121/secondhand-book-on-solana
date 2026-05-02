import { Link, useLocation } from "react-router-dom"
import { Bell, BookOpen, Plus, Search, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import WalletButton from "@/components/common/WalletButton"
import { cn } from "@/lib/utils"

const navLinks = [
    { to: "/", label: "发现" },
    { to: "/orders", label: "我的订单" },
    { to: "/favorites", label: "收藏" },
]

export default function Navbar() {
    const { pathname } = useLocation()

    return (
        <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-border/60 bg-background/80 backdrop-blur-xl">
            {/* 顶部绿色呼吸线 */}
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent breathe-slow" />

            <div className="max-w-6xl mx-auto h-full flex items-center gap-5 px-6">
                {/* Logo */}
                <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
                    <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center breathe">
                        <BookOpen className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="font-semibold text-base tracking-wide text-foreground/90 group-hover:text-foreground transition-colors">
            书集
          </span>
                </Link>

                {/* 搜索框 */}
                <div className="flex-1 max-w-sm relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                        placeholder="搜索书名、作者、ISBN…"
                        className="pl-9 h-9 bg-secondary/50 border-border/50 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-primary/30 focus-visible:border-primary/40"
                    />
                </div>

                {/* 导航链接 */}
                <nav className="flex items-center">
                    {navLinks.map((link) => (
                        <Link
                            key={link.to}
                            to={link.to}
                            className={cn(
                                "px-3 py-1.5 rounded-md text-sm transition-all duration-200",
                                pathname === link.to
                                    ? "text-primary bg-primary/10"
                                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                            )}
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>

                {/* 右侧 */}
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <Button asChild size="sm" className="h-8 gap-1.5 bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 hover:text-primary shadow-none">
                        <Link to="/publish">
                            <Plus className="w-3.5 h-3.5" />
                            发布
                        </Link>
                    </Button>

                    <Button asChild size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-foreground relative">
                        <Link to="/messages">
                            <Bell className="w-4 h-4" />
                            {/* 未读红点 */}
                            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
                        </Link>
                    </Button>

                    <WalletButton />
                </div>
            </div>
        </header>
    )
}