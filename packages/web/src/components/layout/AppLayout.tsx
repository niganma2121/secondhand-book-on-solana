import {Outlet} from "react-router-dom"
import Navbar from "./Navbar"
import BottomNav from "./BottomNav"

export default function AppLayout() {
    return (
        <div className="min-h-screen bg-background">
            {/* PC端顶部导航 — 移动端隐藏 */}
            <div className="hidden md:block">
                <Navbar/>
            </div>

            {/* 主内容区 */}
            <main className="md:pt-16 pb-20 md:pb-0">
                <Outlet/>
            </main>

            {/* 移动端底部导航 — PC端隐藏 */}
            <div className="block md:hidden">
                <BottomNav/>
            </div>
        </div>
    )
}