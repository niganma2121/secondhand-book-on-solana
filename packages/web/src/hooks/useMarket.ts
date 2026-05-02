import type {BookFilter} from "../api/book.ts";
import {useCallback, useEffect, useState} from "react";
import type {BookCard} from "../types/book.ts";
import {getBooks} from "../api/book.ts";

export function useMarket(initFilter:BookFilter){
    const [books, setBooks] = useState<BookCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<BookFilter>(initFilter);


    const fetchBooks=useCallback(async (f:BookFilter)=>{
        setLoading(true);
        setError(null);
        try {
            const res = await getBooks(f);
            setBooks(res.books);
        }catch (err:any){
            setError(err.message||"获取书籍信息失败");
        }finally {
            setLoading(false)
        }
    },[]);

    useEffect(()=>{
        fetchBooks(filter).then(()=>console.log("加载书籍成功"));
    },[filter,fetchBooks]);
    return {books,loading,error,filter,setFilter,refetch:()=>fetchBooks(filter)}
}