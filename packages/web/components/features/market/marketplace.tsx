"use client"

import { useState } from "react"
import { BookCard } from './book-card'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, SlidersHorizontal, Grid3X3, LayoutList } from "lucide-react"

const mockBooks = [
  {
    id: "1",
    title: "深入理解计算机系统",
    author: "Randal E. Bryant",
    cover: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&h=600&fit=crop",
    price: "0.05",
    priceUsd: "150",
    condition: "九成新",
    seller: "0xABC...123",
    likes: 42,
  },
  {
    id: "2",
    title: "算法导论",
    author: "Thomas H. Cormen",
    cover: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&h=600&fit=crop",
    price: "0.08",
    priceUsd: "240",
    condition: "全新",
    seller: "0xDEF...456",
    likes: 128,
  },
  {
    id: "3",
    title: "设计模式",
    author: "Erich Gamma",
    cover: "https://images.unsplash.com/photo-1589998059171-988d887df646?w=400&h=600&fit=crop",
    price: "0.03",
    priceUsd: "90",
    condition: "八成新",
    seller: "0xGHI...789",
    likes: 67,
  },
  {
    id: "4",
    title: "JavaScript高级程序设计",
    author: "Nicholas C. Zakas",
    cover: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&h=600&fit=crop",
    price: "0.04",
    priceUsd: "120",
    condition: "九成新",
    seller: "0xJKL...012",
    likes: 89,
  },
  {
    id: "5",
    title: "Python编程：从入门到实践",
    author: "Eric Matthes",
    cover: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&h=600&fit=crop",
    price: "0.025",
    priceUsd: "75",
    condition: "七成新",
    seller: "0xMNO...345",
    likes: 156,
  },
  {
    id: "6",
    title: "数据结构与算法分析",
    author: "Mark Allen Weiss",
    cover: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=400&h=600&fit=crop",
    price: "0.06",
    priceUsd: "180",
    condition: "全新",
    seller: "0xPQR...678",
    likes: 234,
  },
  {
    id: "7",
    title: "代码整洁之道",
    author: "Robert C. Martin",
    cover: "https://images.unsplash.com/photo-1550399105-c4db5fb85c18?w=400&h=600&fit=crop",
    price: "0.035",
    priceUsd: "105",
    condition: "八成新",
    seller: "0xSTU...901",
    likes: 312,
  },
  {
    id: "8",
    title: "重构：改善既有代码的设计",
    author: "Martin Fowler",
    cover: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=400&h=600&fit=crop",
    price: "0.045",
    priceUsd: "135",
    condition: "九成新",
    seller: "0xVWX...234",
    likes: 178,
  },
]

const categories = [
  "全部分类",
  "计算机科学",
  "文学小说",
  "经济管理",
  "自然科学",
  "人文社科",
  "艺术设计",
  "教材教辅",
]

export function Marketplace() {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  return (
    <section id="market" className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        {/* Section Header */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground md:text-3xl">书籍市场</h2>
            <p className="mt-1 text-muted-foreground">发现优质二手书，开启阅读之旅</p>
          </div>
          <Button variant="outline" className="w-fit">
            查看全部
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-8 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索书名、作者或 ISBN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category */}
          <Select defaultValue="全部分类">
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Condition */}
          <Select defaultValue="all">
            <SelectTrigger className="w-full md:w-32">
              <SelectValue placeholder="品相" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部品相</SelectItem>
              <SelectItem value="new">全新</SelectItem>
              <SelectItem value="90">九成新</SelectItem>
              <SelectItem value="80">八成新</SelectItem>
              <SelectItem value="70">七成新</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select defaultValue="latest">
            <SelectTrigger className="w-full md:w-32">
              <SelectValue placeholder="排序" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">最新上架</SelectItem>
              <SelectItem value="price-low">价格最低</SelectItem>
              <SelectItem value="price-high">价格最高</SelectItem>
              <SelectItem value="popular">最受欢迎</SelectItem>
            </SelectContent>
          </Select>

          {/* View Mode */}
          <div className="flex gap-1 rounded-lg border border-border p-1">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("list")}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
          </div>

          {/* More Filters */}
          <Button variant="outline" size="icon" className="h-10 w-10">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Books Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {mockBooks.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>

        {/* Load More */}
        <div className="mt-12 flex justify-center">
          <Button variant="outline" size="lg">
            加载更多
          </Button>
        </div>
      </div>
    </section>
  )
}
