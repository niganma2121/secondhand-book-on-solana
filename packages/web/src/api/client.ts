const BASE_URL = 'http://localhost:3000/api'

export async function request<T>(
    path:string,
    options?:RequestInit
):Promise<T>{
    const res=await fetch(`${BASE_URL}${path}`,{
        credentials:'include',//JWT
        headers:{
            'Content-Type':'application/json',
            ...options?.headers,
        },
        ...options
    })
    if(!res.ok){
        const err=await res.json();
        throw new Error(err.error ?? '请求失败')
    }
    return res.json()
}