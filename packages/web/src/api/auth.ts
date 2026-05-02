import {request} from "./client.ts";
import type {User} from "../types/user.ts";

//获取nonce
export async function getNonce(pubkey: string): Promise<{ nonce: string }> {
    return request(`/auth/nonce?pubkey=${pubkey}`)
}

//发送签名的nonce,获取jwt后登陆
export async function login(
    data: {
        pubkey: string,
        sig: string,
        nonce: string
    }
):Promise<{msg:string}>{
    return request('/auth/login',{
        method:'POST',
        body:JSON.stringify(data)
    })
}

//退出登陆
export async function logout():Promise<void>{
    return request('/auth/logout')
}

//获取用户信息以及验证身份
export async function getMe():Promise<User>{
    return request('/auth/getme')
}
