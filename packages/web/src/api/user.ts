
import type {Reputation, User} from "../types/user.ts";
import {request} from "./client.ts";
import type {BookCard} from "../types/book.ts";


//获取用户信息
export async function getUser(pubkey:string):Promise<User>{
    return request(`/users/${pubkey}`)
}

//获取用户自己上传的书籍
export async function getUserBooks(pubkey:string,page:number=1):Promise<{books:BookCard[]}>{
    return request(`/users/${pubkey}/books?page=${page}`)
}

//获取用户的评价和信誉
export async function getUserViews(pubkey:string,page:number=1):Promise<{
    reviews:any[],
    reputation:Reputation|null
}>{
    return request(`/users/${pubkey}/review?page=${page}`)
}