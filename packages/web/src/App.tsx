import {BrowserRouter, Routes, Route, Navigate} from "react-router-dom"
import AppLayout from "@/components/layout/AppLayout"
import Home from "@/pages/Home"
import BookDetail from "@/pages/BookDetail"
import Publish from "@/pages/Publish"
import Orders from "@/pages/Orders"
import Profile from "@/pages/Profile"
import Messages from "@/pages/Message"
import Chat from "@/pages/Chat"
import Favorites from "@/pages/Favorites"

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<AppLayout/>}>
                    <Route index element={<Home/>}/>
                    <Route path="/book/:id" element={<BookDetail/>}/>
                    <Route path="/publish" element={<Publish/>}/>
                    <Route path="/orders" element={<Orders/>}/>
                    <Route path="/profile" element={<Profile/>}/>
                    <Route path="/messages" element={<Messages/>}/>
                    <Route path="/messages/:userId" element={<Chat/>}/>
                    <Route path="/favorites" element={<Favorites/>}/>
                    <Route path="*" element={<Navigate to="/" replace/>}/>
                </Route>
            </Routes>
        </BrowserRouter>
    )
}