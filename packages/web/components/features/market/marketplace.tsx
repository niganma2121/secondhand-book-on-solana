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

/** 演示区块占位已清空；若再接展示组件请改为接口数据 */
const mockBooks: {
  id: string
  title: string
  author: string
  cover: string
  price: string
  priceUsd: string
  condition: string
  seller: string
  likes: number
}[] = []

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
