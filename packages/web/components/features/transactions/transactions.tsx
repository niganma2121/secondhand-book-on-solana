"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react"

const mockTransactions: {
  id: string
  type: string
  book: string
  price: string
  status: string
  timestamp: string
  txHash: string
  counterparty: string
}[] = []

const statusConfig = {
  completed: {
    label: "已完成",
    icon: CheckCircle2,
    className: "bg-primary/20 text-primary",
  },
  pending: {
    label: "进行中",
    icon: Loader2,
    className: "bg-yellow-500/20 text-yellow-400",
  },
  failed: {
    label: "已失败",
    icon: XCircle,
    className: "bg-destructive/20 text-destructive",
  },
}

export function Transactions() {
  return (
    <section id="transactions" className="py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground md:text-3xl">交易记录</h2>
            <p className="mt-1 text-muted-foreground">追踪您的所有链上交易</p>
          </div>
          <Button variant="outline">查看全部</Button>
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">最近交易</CardTitle>
              <div className="flex gap-2">
                <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                  全部
                </Badge>
                <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                  购买
                </Badge>
                <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                  出售
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {mockTransactions.map((tx) => {
                const status = statusConfig[tx.status as keyof typeof statusConfig]
                const StatusIcon = status.icon

                return (
                  <div
                    key={tx.id}
                    className="flex flex-col gap-4 p-4 transition-colors hover:bg-secondary/50 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-center gap-4">
                      {/* Transaction Type Icon */}
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          tx.type === "buy"
                            ? "bg-primary/10 text-primary"
                            : "bg-blue-500/10 text-blue-400"
                        }`}
                      >
                        {tx.type === "buy" ? (
                          <ArrowDownLeft className="h-5 w-5" />
                        ) : (
                          <ArrowUpRight className="h-5 w-5" />
                        )}
                      </div>

                      {/* Transaction Info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{tx.book}</span>
                          <Badge className={`border-0 ${status.className}`}>
                            <StatusIcon
                              className={`mr-1 h-3 w-3 ${tx.status === "pending" ? "animate-spin" : ""}`}
                            />
                            {status.label}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{tx.type === "buy" ? "购买自" : "出售给"}</span>
                          <span className="font-mono">{tx.counterparty}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-6 md:justify-end">
                      {/* Price */}
                      <div className="text-right">
                        <div
                          className={`font-semibold ${tx.type === "buy" ? "text-destructive" : "text-primary"}`}
                        >
                          {tx.type === "buy" ? "-" : "+"}
                          {tx.price}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {tx.timestamp}
                        </div>
                      </div>

                      {/* View on Explorer */}
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
