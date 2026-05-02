import { Heart } from "lucide-react"
import BookCard from "@/components/common/BookCard"
import PageHeader from "@/components/common/PageHeader"
import { mockBooks } from "@/fixtures"

const favorited = mockBooks.filter(b => b.isFavorited)

export default function Favorites() {
    return (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
            <PageHeader
                title="我的收藏"
                subtitle={`${favorited.length} 本书籍`}
            />

            {favorited.length === 0 ? (
                <div className="flex flex-col items-center py-20 text-muted-foreground">
                    <Heart className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">还没有收藏的书籍</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                    {favorited.map((book, i) => (
                        <BookCard
                            key={book.id}
                            book={{ ...book, isFavorited: true }}
                            className="fade-up"
                            style={{ animationDelay: `${i * 60}ms` }}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}