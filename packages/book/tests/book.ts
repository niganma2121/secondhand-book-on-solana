import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
// 注意：Book 这个类型是在你运行 anchor build 后自动生成的
import { Book } from "../target/types/book";

describe("book_test", () => {
    // 配置客户端连接到本地集群或 Devnet
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.Book as Program<Book>;

    it("Is initialized!", async () => {
        // 这里调用你合约里的 initialize 指令
        const tx = await program.methods.initialize().rpc();
        console.log("交易签名:", tx);
    });
});