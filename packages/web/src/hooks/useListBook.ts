import {useState} from "react";
import {createBook, type CreateBookData} from "../api/book";
import {useNavigate} from "react-router-dom";

export function useListBook() {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handlePublish = async (formData: CreateBookData) => {
        setLoading(true);
        try {
            //价格转为 Lamports
            const finalData = {
                ...formData,
                price: Math.floor(formData.price * 1e9)
            };

            //调用后端接口上架
            const {asset} = await createBook(finalData);

            //上架成功跳转详情
            navigate(`/books/${asset}`);
        } catch (err: any) {
            alert(err.message || "上架失败");
        } finally {
            setLoading(false);
        }
    };
    return {handlePublish, loading};
}