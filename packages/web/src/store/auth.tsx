import type {User} from "../types/user.ts";
import {createContext, ReactNode, useEffect, useState} from "react";
import {getMe} from "../api/auth.ts";

//认证状态
interface AuthState {
    user: User | null,//当前登陆用户
    isLoading: boolean,//验证身份中
    isLoggedIn: boolean,//是否已登陆
    setUser: (user: User | null) => void
}

export const AuthContext = createContext<AuthState>({
    user: null,
    isLoading: true,
    isLoggedIn: false,
    setUser: () => {
    }
})

export function AuthProvider({children}: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    //页面加载的时候自动验证身份
    useEffect(() => {
        getMe()
            .then((u) => setUser(u))
            .catch(() => setUser(null))
            .finally(() => setIsLoading(false))
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            isLoading,
            isLoggedIn: !!user,
            setUser,
        }}>
            {children}
        </AuthContext.Provider>
    )

}
