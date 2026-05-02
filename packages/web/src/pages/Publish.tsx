import { useState } from "react"
import { Upload, X, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import PageHeader from "@/components/common/PageHeader"
import { categories } from "@/fixtures"

export default function Publish() {
    const [images, setImages] = useState<string[]>([])

    return (
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-6">
            <PageHeader title="发布书籍" subtitle="填写书籍信息，发布到区块链市场" />

            <div className="space-y-6">
                {/* 封面上传 */}
                <div className="space-y-2">
                    <Label className="text-sm text-foreground/80">书籍图片</Label>
                    <div className="grid grid-cols-4 gap-3">
                        {images.map((img, i) => (
                            <div key={i} className="aspect-[3/4] relative rounded-lg overflow-hidden border border-border/50">
                                <img src={img} alt="" className="w-full h-full object-cover" />
                                <button
                                    onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/80 flex items-center justify-center"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        {images.length < 4 && (
                            <button
                                onClick={() => console.log("选择图片")}
                                className="aspect-[3/4] rounded-lg border border-dashed border-border hover:border-primary/50 bg-card hover:bg-primary/5 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-all duration-200"
                            >
                                <Upload className="w-5 h-5" />
                                <span className="text-xs">上传</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* 基本信息 */}
                <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
                    <h3 className="text-sm font-medium text-foreground/80">基本信息</h3>

                    <div className="space-y-2">
                        <Label htmlFor="title" className="text-sm text-muted-foreground">书名 *</Label>
                        <Input id="title" placeholder="请输入书名" className="bg-secondary/30 border-border/50 focus-visible:ring-primary/30" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="author" className="text-sm text-muted-foreground">作者</Label>
                            <Input id="author" placeholder="作者姓名" className="bg-secondary/30 border-border/50 focus-visible:ring-primary/30" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="isbn" className="text-sm text-muted-foreground">ISBN</Label>
                            <Input id="isbn" placeholder="978-..." className="bg-secondary/30 border-border/50 font-mono focus-visible:ring-primary/30" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="publisher" className="text-sm text-muted-foreground">出版社</Label>
                        <Input id="publisher" placeholder="出版社名称" className="bg-secondary/30 border-border/50 focus-visible:ring-primary/30" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label className="text-sm text-muted-foreground">分类</Label>
                            <Select>
                                <SelectTrigger className="bg-secondary/30 border-border/50 focus:ring-primary/30">
                                    <SelectValue placeholder="选择分类" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border/60">
                                    {categories.filter(c => c !== "全部").map(cat => (
                                        <SelectItem key={cat} value={cat} className="focus:bg-primary/10">{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm text-muted-foreground">书况</Label>
                            <Select>
                                <SelectTrigger className="bg-secondary/30 border-border/50 focus:ring-primary/30">
                                    <SelectValue placeholder="选择书况" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border/60">
                                    {[["new","全新"],["like_new","近新"],["good","良好"],["fair","一般"]].map(([v, l]) => (
                                        <SelectItem key={v} value={v} className="focus:bg-primary/10">{l}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* 价格 */}
                <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
                    <h3 className="text-sm font-medium text-foreground/80">定价</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="price" className="text-sm text-muted-foreground">出售价格 (ETH) *</Label>
                            <div className="relative">
                                <Input
                                    id="price"
                                    type="number"
                                    placeholder="0.05"
                                    step="0.001"
                                    className="pr-12 bg-secondary/30 border-border/50 font-mono focus-visible:ring-primary/30"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ETH</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="original" className="text-sm text-muted-foreground">原价 (¥)</Label>
                            <div className="relative">
                                <Input
                                    id="original"
                                    type="number"
                                    placeholder="35.00"
                                    className="pr-8 bg-secondary/30 border-border/50 font-mono focus-visible:ring-primary/30"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 描述 */}
                <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
                    <h3 className="text-sm font-medium text-foreground/80">书况描述</h3>
                    <Textarea
                        placeholder="描述书本的使用情况，如笔记多少、是否有缺页等…"
                        className="bg-secondary/30 border-border/50 focus-visible:ring-primary/30 min-h-[100px] resize-none"
                    />
                </div>

                {/* 提示 */}
                <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        发布后将通过智能合约上链，买家购买时资金将锁定在合约中，确认收货后自动转给您。
                    </p>
                </div>

                {/* 提交 */}
                <Button
                    className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 breathe font-medium"
                    onClick={() => console.log("发布")}
                >
                    发布到区块链市场
                </Button>
            </div>
        </div>
    )
}