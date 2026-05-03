"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Shield, Zap, Globe } from "lucide-react"

export function Hero() {
  return (
    <section className="relative overflow-hidden py-20 md:py-32">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4">
        <div className="flex flex-col items-center text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-sm text-muted-foreground">基于区块链的去中心化交易</span>
          </div>

          {/* Main heading */}
          <h1 className="max-w-4xl text-balance text-4xl font-bold tracking-tight text-foreground md:text-6xl lg:text-7xl">
            让每一本书都有
            <span className="text-primary">可追溯</span>的故事
          </h1>

          {/* Description */}
          <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
            BookChain 是一个去中心化的二手书交易平台，利用区块链技术确保每笔交易安全透明，
            让书籍的流转历史永久可查。
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button size="lg" className="gap-2 px-8">
              开始交易
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="px-8">
              了解更多
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { value: "10,000+", label: "书籍在售" },
              { value: "5,000+", label: "活跃用户" },
              { value: "20,000+", label: "成功交易" },
              { value: "100%", label: "安全保障" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl font-bold text-primary md:text-3xl">{stat.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="mt-20 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Shield,
                title: "安全可信",
                description: "智能合约保障交易安全，资金托管直至确认收货",
              },
              {
                icon: Globe,
                title: "去中心化",
                description: "无需中间商，买卖双方直接交易，降低手续费",
              },
              {
                icon: Zap,
                title: "快速便捷",
                description: "即时结算，链上确认后资金自动转账",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
