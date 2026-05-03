"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Heart, ShoppingCart, Eye } from "lucide-react"
import Image from "next/image"

interface BookCardProps {
  book: {
    id: string
    title: string
    author: string
    cover: string
    price: string
    priceUsd: string
    condition: string
    seller: string
    likes: number
  }
}

export function BookCard({ book }: BookCardProps) {
  const conditionColors: Record<string, string> = {
    全新: "bg-primary/20 text-primary",
    九成新: "bg-blue-500/20 text-blue-400",
    八成新: "bg-yellow-500/20 text-yellow-400",
    七成新: "bg-orange-500/20 text-orange-400",
  }

  return (
    <Card className="group overflow-hidden border-border bg-card transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="p-0">
        {/* Book Cover */}
        <div className="relative aspect-[3/4] overflow-hidden bg-secondary">
          <Image
            src={book.cover}
            alt={book.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {/* Overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/80 opacity-0 transition-opacity group-hover:opacity-100">
            <Button size="icon" variant="secondary" className="h-10 w-10">
              <Eye className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="secondary" className="h-10 w-10">
              <Heart className="h-4 w-4" />
            </Button>
            <Button size="icon" className="h-10 w-10">
              <ShoppingCart className="h-4 w-4" />
            </Button>
          </div>
          {/* Condition Badge */}
          <Badge
            className={`absolute right-2 top-2 border-0 ${conditionColors[book.condition] || "bg-secondary text-secondary-foreground"}`}
          >
            {book.condition}
          </Badge>
        </div>

        {/* Book Info */}
        <div className="p-4">
          <h3 className="line-clamp-1 font-semibold text-foreground">{book.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{book.author}</p>

          <div className="mt-3 flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-primary">{book.price} ETH</div>
              <div className="text-xs text-muted-foreground">≈ ${book.priceUsd}</div>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Heart className="h-3 w-3" />
              {book.likes}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-secondary" />
            <span className="text-xs text-muted-foreground">{book.seller}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
