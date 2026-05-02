import {useContext} from "react";
import {AuthContext} from "../store/auth.tsx";


export function useAuth(){
    return useContext(AuthContext)
}

