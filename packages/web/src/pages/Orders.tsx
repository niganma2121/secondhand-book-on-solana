import { useState } from "react"
import { Package, ArrowUpRight, Clock, CheckCircle2, XCircle, Truck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import PageHeader from "@/components/common/PageHeader"
import { shortAddress, formatPrice } from "@/lib/utils"
import { mockOrders } from "@/fixtures"
import type { Order } from "@/types"
import { cn } from "@/lib/utils"

const statusConfig = {
    pending:   { label: "待付款", icon: Clock,        className: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    paid:      { label: "已付款", icon: CheckCircle2, className: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
    shipped:   { label: "已发货", icon: Truck,        className: "text-primary bg-primary/10 border-primary/20" },
    completed: { label: "已完成", icon: CheckCircle2, className: "text-primary bg-primary/10 border-primary/20" },
    cancelled: { label: "已取消", icon: XCircle,      className: "text-muted-foreground bg-muted border-border" },
}

function OrderCard({ order }: { order: Order }) {
    const status = statusConfig[order.status]
    const StatusIcon = status.icon

    return (
        <div className="rounded-xl border border-border/50 bg-card p-4 card-glow fade-up">
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{order.id}</span>
                    <Badge variant="outline" className={cn("text-[10px] h-5 gap-1", status.className)}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {status.label}
                    </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{order.createdAt}</span>
            </div>

            <div className="flex gap-3">
                <div className="w-12 h-16 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 border border-border/30">
                    <Package className="w-5 h-5 text-muted-foreground/40" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-1">{order.book.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{order.book.author}</p>
                    <p className="font-mono text-sm text-primary font-medium mt-1">{formatPrice(order.price)}</p>
                </div>
            </div>

            {order.txHash && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
                    <span className="text-[11px] text-muted-foreground">交易哈希</span>
                    <span className="font-mono text-[11px] text-muted-foreground truncate flex-1">{order.txHash}</span>
                    <Button variant="ghost" size="icon" className="w-5 h-5 text-muted-foreground hover:text-primary">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                    </Button>
                </div>
            )}

            {order.status === "shipped" && (
                <Button
                    size="sm"
                    className="w-full mt-3 h-8 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 shadow-none"
                    onClick={() => console.log("确认收货")}
                >
                    确认收货
                </Button>
            )}
        </div>
    )
}

export default function Orders() {
    return (
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-6">
            <PageHeader title="我的订单" />

            <Tabs defaultValue="buying">
                <TabsList className="w-full bg-secondary/50 border border-border/50 mb-5">
                    <TabsTrigger value="buying" className="flex-1 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                        我买到的
                    </TabsTrigger>
                    <TabsTrigger value="selling" className="flex-1 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                        我卖出的
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="buying" className="space-y-3">
                    {mockOrders.map(order => <OrderCard key={order.id} order={order} />)}
                </TabsContent>

                <TabsContent value="selling" className="space-y-3">
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <Package className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm">暂无卖出记录</p>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}