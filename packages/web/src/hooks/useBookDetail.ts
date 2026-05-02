import {useState, useEffect} from "react";
import {getBookDetail} from "../api/book";
import type {BookDetail} from "../types/book";

export function useBookDetail(asset: string) {
    const [book, setBook] = useState<BookDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!asset) return;

        async function loadDetail() {
            setLoading(true);
            try {
                const data = await getBookDetail(asset);
                setBook(data);
            } catch (err: any) {
                setError(err.message || "获取详情失败");
            } finally {
                setLoading(false);
            }
        }

        loadDetail();
    }, [asset]);

    return {book, loading, error};
}