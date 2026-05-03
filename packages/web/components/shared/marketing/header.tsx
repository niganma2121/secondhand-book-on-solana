"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BookOpen, Wallet, Menu, X, User, LogOut, Settings } from "lucide-react"

export function Header() {
  const [isConnected, setIsConnected] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const walletAddress = "0x1234...5678"

  const navItems = [
    { label: "市场", href: "#market" },
    { label: "我的书架", href: "#mybooks" },
    { label: "交易记录", href: "#transactions" },
    { label: "上架书籍", href: "#list" },
  ]

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <BookOpen className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground">BookChain</span>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Wallet Connection */}
        <div className="hidden items-center gap-3 md:flex">
          {isConnected ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span>{walletAddress}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="gap-2">
                  <User className="h-4 w-4" />
                  个人中心
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2">
                  <Settings className="h-4 w-4" />
                  设置
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 text-destructive"
                  onClick={() => setIsConnected(false)}
                >
                  <LogOut className="h-4 w-4" />
                  断开连接
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={() => setIsConnected(true)} className="gap-2">
              <Wallet className="h-4 w-4" />
              连接钱包
            </Button>
          )}
        </div>

        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="border-t border-border bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-4">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="pt-4">
              {isConnected ? (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setIsConnected(false)}
                >
                  <Wallet className="h-4 w-4 text-primary" />
                  断开连接
                </Button>
              ) : (
                <Button className="w-full gap-2" onClick={() => setIsConnected(true)}>
                  <Wallet className="h-4 w-4" />
                  连接钱包
                </Button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
