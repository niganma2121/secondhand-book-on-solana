import { Link, useLocation } from "react-router-dom"
import { Home, Heart, PlusCircle, MessageCircle, User } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
    { to: "/", icon: Home, label: "首页" },
    { to: "/favorites", icon: Heart, label: "收藏" },
    { to: "/publish", icon: PlusCircle, label: "发布", primary: true },
    { to: "/messages", icon: MessageCircle, label: "消息", badge: true },
    { to: "/profile", icon: User, label: "我的" },
]

export default function BottomNav() {
    const { pathname } = useLocation()

    return (
        <nav className="fixed bottom-0 inset-x-0 z-50 h-16 border-t border-border/60 bg-background/90 backdrop-blur-xl safe-area-bottom">
            {/* 底部呼吸线 */}
            <div className="absolute bottom-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent breathe-slow" />

            <div className="flex h-full items-stretch">
                {navItems.map(({ to, icon: Icon, label, primary, badge }) => {
                    const isActive = pathname === to

                    if (primary) {
                        return (
                            <Link
                                key={to}
                                to={to}
                                className="flex-1 flex flex-col items-center justify-center"
                            >
                                <div className={cn(
                                    "w-11 h-11 rounded-full flex items-center justify-center -mt-4",
                                    "bg-primary text-primary-foreground shadow-lg shadow-primary/30 breathe"
                                )}>
                                    <Icon className="w-5 h-5" />
                                </div>
                            </Link>
                        )
                    }

                    return (
                        <Link
                            key={to}
                            to={to}
                            className={cn(
                                "flex-1 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 relative",
                                isActive ? "text-primary" : "text-muted-foreground"
                            )}
                        >
                            <div className="relative">
                                <Icon className={cn("w-5 h-5 transition-transform duration-200", isActive && "scale-110")} />
                                {badge && (
                                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
                                )}
                            </div>
                            <span className={cn("text-[10px] tracking-wide", isActive && "font-medium")}>{label}</span>
                            {isActive && (
                                <span className="absolute bottom-2 w-4 h-[2px] rounded-full bg-primary" />
                            )}
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}