import { BookOpen, Github, Twitter } from "lucide-react"

const footerLinks = {
  产品: ["市场", "上架书籍", "交易记录", "钱包"],
  支持: ["帮助中心", "联系我们", "常见问题", "费用说明"],
  法律: ["服务条款", "隐私政策", "Cookie 政策"],
  社区: ["Discord", "Twitter", "GitHub", "博客"],
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-6">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <BookOpen className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">BookChain</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              基于区块链技术的去中心化二手书交易平台，让每一本书都有可追溯的故事。
            </p>
            <div className="mt-6 flex gap-4">
              <a
                href="#"
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Twitter className="h-5 w-5" />
              </a>
              <a
                href="#"
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Github className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="mb-4 font-semibold text-foreground">{title}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © 2024 BookChain. 保留所有权利。
          </p>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">支持的网络：</span>
            <div className="flex gap-2">
              <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                Ethereum
              </span>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                Polygon
              </span>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                Arbitrum
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
