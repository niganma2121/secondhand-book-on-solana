import { Home, MessageCircle, PlusSquare, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { cn } from "@/lib/utils";

const tabs = [
    { name: "广场", path: "/", icon: Home, needAuth: false },
    { name: "消息", path: "/chat", icon: MessageCircle, needAuth: true },
    { name: "卖书", path: "/publish", icon: PlusSquare, needAuth: true },
    { name: "我的", path: "/profile", icon: User, needAuth: true },
];

export default function Tabbar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { connected } = useWallet();
    const { setVisible } = useWalletModal();

    const handlePress = (tab: typeof tabs[0]) => {
        if (tab.needAuth && !connected) {
            // 核心逻辑：未登录则弹出 Solana 钱包选择器
            setVisible(true);
        } else {
            navigate(tab.path);
        }
    };

    return (
        <div className="flex justify-around items-center h-16 bg-white/80 backdrop-blur-lg border-t border-zinc-100 pb-safe">
            {tabs.map((tab) => {
                const isActive = location.pathname === tab.path;
                return (
                    <button
                        key={tab.path}
                        onClick={() => handlePress(tab)}
                        className={cn(
                            "flex flex-col items-center gap-1 flex-1 transition-all active:scale-90",
                            isActive ? "text-yellow-600" : "text-zinc-400"
                        )}
                    >
                        <tab.icon
                            size={22}
                            strokeWidth={isActive ? 2.5 : 2}
                            className={cn(isActive && "drop-shadow-[0_0_8px_rgba(202,138,4,0.3)]")}
                        />
                        <span className="text-[10px] font-bold">{tab.name}</span>
                    </button>
                );
            })}
        </div>
    );
}