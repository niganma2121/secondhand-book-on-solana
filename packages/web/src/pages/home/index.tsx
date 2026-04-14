// src/pages/home/index.tsx
export default function Home() {
    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold">📚 BookChain 广场</h1>
            <p className="text-zinc-500 mt-2">在这里发现你的下一本好书...</p>

            {/* 临时的占位卡片 */}
            <div className="mt-6 grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="aspect-[3/4] bg-zinc-200 rounded-xl flex items-center justify-center text-zinc-400">
                        书籍封面 {i}
                    </div>
                ))}
            </div>
        </div>
    );
}