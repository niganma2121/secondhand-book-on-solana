import * as React from "react";

interface PageHeaderProps {
    title: string
    subtitle?: string
    action?: React.ReactNode
}

export default function PageHeader({ title, subtitle, action }: PageHeaderProps) {
    return (
        <div className="flex items-start justify-between mb-6">
            <div>
                <h1 className="text-xl font-semibold text-foreground tracking-wide">{title}</h1>
                {subtitle && (
                    <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
                )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    )
}