"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Edit, Trash2, Eye, Package, BookMarked, ShoppingBag } from "lucide-react"
import Image from "next/image"

const myListedBooks = [
  {
    id: "1",
    title: "深入理解计算机系统",
    author: "Randal E. Bryant",
    cover: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&h=600&fit=crop",
    price: "0.05",
    condition: "九成新",
    status: "listing",
    views: 234,
    likes: 42,
  },
  {
    id: "2",
    title: "算法导论",
    author: "Thomas H. Cormen",
    cover: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&h=600&fit=crop",
    price: "0.08",
    condition: "全新",
    status: "sold",
    views: 567,
    likes: 128,
  },
]

const myPurchasedBooks = [
  {
    id: "3",
    title: "设计模式",
    author: "Erich Gamma",
    cover: "https://images.unsplash.com/photo-1589998059171-988d887df646?w=400&h=600&fit=crop",
    price: "0.03",
    condition: "八成新",
    purchaseDate: "2024-01-10",
    seller: "0xABC...123",
  },
  {
    id: "4",
    title: "代码整洁之道",
    author: "Robert C. Martin",
    cover: "https://images.unsplash.com/photo-1550399105-c4db5fb85c18?w=400&h=600&fit=crop",
    price: "0.035",
    condition: "九成新",
    purchaseDate: "2024-01-08",
    seller: "0xDEF...456",
  },
]

const statusConfig = {
  listing: { label: "在售中", className: "bg-primary/20 text-primary" },
  sold: { label: "已售出", className: "bg-blue-500/20 text-blue-400" },
  pending: { label: "交易中", className: "bg-yellow-500/20 text-yellow-400" },
}

export function MyBooks() {
  return (
    <section id="mybooks" className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground md:text-3xl">我的书架</h2>
          <p className="mt-1 text-muted-foreground">管理您的书籍和交易</p>
        </div>

        <Tabs defaultValue="listed" className="w-full">
          <TabsList className="mb-6 grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="listed" className="gap-2">
              <Package className="h-4 w-4" />
              我的上架
            </TabsTrigger>
            <TabsTrigger value="purchased" className="gap-2">
              <ShoppingBag className="h-4 w-4" />
              我的购买
            </TabsTrigger>
          </TabsList>

          <TabsContent value="listed">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myListedBooks.map((book) => {
                const status = statusConfig[book.status as keyof typeof statusConfig]
                return (
                  <Card
                    key={book.id}
                    className="overflow-hidden border-border bg-card transition-colors hover:border-primary/50"
                  >
                    <CardContent className="p-0">
                      <div className="flex gap-4 p-4">
                        {/* Book Cover */}
                        <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-lg bg-secondary">
                          <Image
                            src={book.cover}
                            alt={book.title}
                            fill
                            className="object-cover"
                          />
                        </div>

                        {/* Book Info */}
                        <div className="flex flex-1 flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="line-clamp-2 font-semibold text-foreground">
                              {book.title}
                            </h3>
                            <Badge className={`shrink-0 border-0 ${status.className}`}>
                              {status.label}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{book.author}</p>
                          <p className="mt-1 text-xs text-muted-foreground">品相：{book.condition}</p>

                          <div className="mt-auto flex items-center justify-between pt-3">
                            <div className="text-lg font-bold text-primary">{book.price} ETH</div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Eye className="h-3 w-3" />
                              {book.views}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex border-t border-border">
                        <Button
                          variant="ghost"
                          className="flex-1 rounded-none border-r border-border"
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          className="flex-1 rounded-none text-destructive hover:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          下架
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}

              {/* Add New Book Card */}
              <Card className="flex min-h-[200px] cursor-pointer items-center justify-center border-dashed border-border bg-card transition-colors hover:border-primary/50 hover:bg-secondary/50">
                <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <BookMarked className="h-6 w-6 text-primary" />
                  </div>
                  <span className="font-medium text-foreground">上架新书</span>
                  <span className="text-sm text-muted-foreground">点击添加您要出售的书籍</span>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="purchased">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myPurchasedBooks.map((book) => (
                <Card
                  key={book.id}
                  className="overflow-hidden border-border bg-card transition-colors hover:border-primary/50"
                >
                  <CardContent className="p-0">
                    <div className="flex gap-4 p-4">
                      {/* Book Cover */}
                      <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-lg bg-secondary">
                        <Image src={book.cover} alt={book.title} fill className="object-cover" />
                      </div>

                      {/* Book Info */}
                      <div className="flex flex-1 flex-col">
                        <h3 className="line-clamp-2 font-semibold text-foreground">{book.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{book.author}</p>
                        <p className="mt-1 text-xs text-muted-foreground">品相：{book.condition}</p>

                        <div className="mt-auto pt-3">
                          <div className="text-lg font-bold text-primary">{book.price} ETH</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            购买日期：{book.purchaseDate}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            卖家：{book.seller}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
