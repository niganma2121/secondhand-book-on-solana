import { cn } from "@/lib/utils"
//加载的时候站位
export default function BookCardSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn("rounded-xl border border-border/50 bg-card overflow-hidden", className)}>
            <div className="aspect-[3/4] shimmer" />
            <div className="p-3 space-y-2">
                <div className="h-3.5 rounded shimmer" />
                <div className="h-3.5 w-2/3 rounded shimmer" />
                <div className="h-3 w-1/2 rounded shimmer" />
                <div className="flex justify-between items-center pt-0.5">
                    <div className="h-4 w-16 rounded shimmer" />
                    <div className="h-5 w-10 rounded-md shimmer" />
                </div>
            </div>
        </div>
    )
}