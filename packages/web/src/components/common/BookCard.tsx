import {Link} from "react-router-dom"
import {Heart, BookOpen} from "lucide-react"
import {Badge} from "@/components/ui/badge"
import {cn, formatPrice} from "@/lib/utils"
import type {Book} from "@/types"

const conditionConfig = {
    new: {label: "全新", className: "bg-primary/15 text-primary border-primary/20"},
    like_new: {label: "近新", className: "bg-blue-500/10 text-blue-400 border-blue-500/20"},
    good: {label: "良好", className: "bg-amber-500/10 text-amber-400 border-amber-500/20"},
    fair: {label: "一般", className: "bg-muted text-muted-foreground border-border"},
}

interface BookCardProps {
    book: Book
    className?: string
    style?: React.CSSProperties
}

export default function BookCard({book, className, style}: BookCardProps) {
    const cond = conditionConfig[book.condition]

    return (
        <div
            style={style}
            className={cn(
                "group relative rounded-xl border border-border/50 bg-card overflow-hidden",
                "card-glow cursor-pointer",
                className
            )}
        >
            <Link to={`/book/${book.id}`} className="block">
                {/* 封面 */}
                <div className="aspect-[3/4] bg-muted/50 flex items-center justify-center overflow-hidden relative">
                    {book.images[0] ? (
                        <img
                            src={book.images[0]}
                            alt={book.title}
                            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground/30">
                            <BookOpen className="w-10 h-10"/>
                        </div>
                    )}

                    {/* 收藏按钮 */}
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            console.log("收藏", book.id)
                        }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/60 backdrop-blur-sm border border-border/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:border-primary/40"
                    >
                        <Heart className={cn(
                            "w-3.5 h-3.5 transition-colors",
                            book.isFavorited ? "fill-primary text-primary" : "text-muted-foreground"
                        )}/>
                    </button>

                    {/* 状态遮罩 */}
                    {book.status !== "available" && (
                        <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
              <span className="text-sm font-medium text-muted-foreground">
                {book.status === "sold" ? "已售出" : "已预订"}
              </span>
                        </div>
                    )}
                </div>

                {/* 信息 */}
                <div className="p-3 space-y-1.5">
                    <h3 className="text-sm font-medium leading-snug line-clamp-2 text-foreground/90 group-hover:text-foreground transition-colors">
                        {book.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-1">{book.author}</p>

                    <div className="flex items-center justify-between pt-0.5">
            <span className="font-mono text-sm font-medium text-primary">
              {formatPrice(book.price)}
            </span>
                        <Badge
                            variant="outline"
                            className={cn("text-[10px] h-5 px-1.5 rounded-md font-normal", cond.className)}
                        >
                            {cond.label}
                        </Badge>
                    </div>
                </div>
            </Link>
        </div>
    )
}