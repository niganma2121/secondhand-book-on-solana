import { Outlet } from "react-router-dom";
import Tabbar from "../components/common/Tabbar.tsx";

export default function MainLayout() {
    return (
        <div className="flex flex-col h-screen bg-zinc-50 overflow-hidden">
            {/* 顶部滚动内容区 */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
                <Outlet />
            </main>

            {/* 底部固定导航栏 */}
            <footer className="flex-none">
                <Tabbar />
            </footer>
        </div>
    );
}