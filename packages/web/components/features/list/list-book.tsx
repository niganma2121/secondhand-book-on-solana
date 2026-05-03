"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Upload, ImagePlus, X, Loader2 } from "lucide-react"

export function ListBook() {
  const [images, setImages] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleImageUpload = () => {
    // Mock image upload
    const mockImages = [
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200&h=300&fit=crop",
      "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=200&h=300&fit=crop",
    ]
    if (images.length < 4) {
      setImages([...images, mockImages[images.length % 2]])
    }
  }

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    // Mock submission
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setIsSubmitting(false)
  }

  return (
    <section id="list" className="py-16">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-foreground md:text-3xl">上架书籍</h2>
          <p className="mt-1 text-muted-foreground">将您的闲置书籍上架到区块链市场</p>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>书籍信息</CardTitle>
            <CardDescription>请填写完整的书籍信息以便买家了解</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Image Upload */}
              <div className="space-y-2">
                <Label>书籍图片（最多4张）</Label>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {images.map((image, index) => (
                    <div
                      key={index}
                      className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-secondary"
                    >
                      <img src={image} alt={`Book ${index + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {images.length < 4 && (
                    <button
                      type="button"
                      onClick={handleImageUpload}
                      className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/50 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      <ImagePlus className="h-8 w-8" />
                      <span className="text-xs">添加图片</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Basic Info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="title">书名 *</Label>
                  <Input id="title" placeholder="请输入书籍名称" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="author">作者 *</Label>
                  <Input id="author" placeholder="请输入作者姓名" required />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="isbn">ISBN</Label>
                  <Input id="isbn" placeholder="请输入 ISBN 编号" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="publisher">出版社</Label>
                  <Input id="publisher" placeholder="请输入出版社名称" />
                </div>
              </div>

              {/* Category & Condition */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>分类 *</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="选择书籍分类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cs">计算机科学</SelectItem>
                      <SelectItem value="literature">文学小说</SelectItem>
                      <SelectItem value="business">经济管理</SelectItem>
                      <SelectItem value="science">自然科学</SelectItem>
                      <SelectItem value="social">人文社科</SelectItem>
                      <SelectItem value="art">艺术设计</SelectItem>
                      <SelectItem value="textbook">教材教辅</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>品相 *</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="选择书籍品相" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">全新 - 未使用过</SelectItem>
                      <SelectItem value="90">九成新 - 轻微使用痕迹</SelectItem>
                      <SelectItem value="80">八成新 - 有一定使用痕迹</SelectItem>
                      <SelectItem value="70">七成新 - 明显使用痕迹</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Price */}
              <div className="space-y-2">
                <Label htmlFor="price">定价 (ETH) *</Label>
                <div className="relative">
                  <Input
                    id="price"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="0.00"
                    className="pr-16"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ETH
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  建议参考市场同类书籍定价，合理的价格能帮助您更快出售
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">书籍描述</Label>
                <Textarea
                  id="description"
                  placeholder="请详细描述书籍的状态、内容亮点等信息..."
                  rows={4}
                />
              </div>

              {/* Submit */}
              <div className="flex flex-col gap-4 pt-4 sm:flex-row">
                <Button type="submit" className="flex-1 gap-2" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      上架中...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      确认上架
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" className="flex-1">
                  保存草稿
                </Button>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                上架书籍需要支付少量 Gas 费用，交易完成后将自动扣除 2% 平台服务费
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
