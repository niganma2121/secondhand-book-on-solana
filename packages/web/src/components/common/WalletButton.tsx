import { Wallet, Copy, LogOut, ChevronDown, CheckCircle2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { shortAddress } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { fixtureWalletDevDisplay } from "@/fixtures"

export default function WalletButton() {
    const [copied, setCopied] = useState(false)
    const { connected: mockConnected, address: mockAddress, balanceLabel: mockBalance } =
        fixtureWalletDevDisplay

    const handleCopy = () => {
        navigator.clipboard.writeText(mockAddress)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    if (!mockConnected) {
        return (
            <Button
                size="sm"
                onClick={() => console.log("连接钱包")}
                className="h-8 gap-2 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 shadow-none font-normal"
            >
                <Wallet className="w-3.5 h-3.5" />
                <span className="text-sm">连接钱包</span>
            </Button>
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-2 border border-border/60 hover:border-primary/40 hover:bg-primary/5 font-normal"
                >
                    {/* 在线绿点 */}
                    <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
                    <span className="font-mono text-sm text-foreground/80">{shortAddress(mockAddress)}</span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                className="w-56 bg-card border-border/60 shadow-2xl shadow-black/40"
            >
                <DropdownMenuLabel className="pb-2">
                    <p className="text-[11px] text-muted-foreground mb-1 tracking-wider uppercase">已连接</p>
                    <p className="font-mono text-sm text-foreground">{shortAddress(mockAddress)}</p>
                    <p className="text-xs text-primary mt-0.5">{mockBalance} ETH</p>
                </DropdownMenuLabel>

                <DropdownMenuSeparator className="bg-border/50" />

                <DropdownMenuItem
                    onClick={handleCopy}
                    className="gap-2 text-sm cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                >
                    {copied ? (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                    ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                    {copied ? "已复制" : "复制地址"}
                </DropdownMenuItem>

                <DropdownMenuItem
                    onClick={() => console.log("断开")}
                    className="gap-2 text-sm cursor-pointer text-destructive focus:text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
                >
                    <LogOut className="w-4 h-4" />
                    断开连接
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}