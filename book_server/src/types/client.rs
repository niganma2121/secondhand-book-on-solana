use std::sync::Arc;
use anchor_client::Client;
use solana_sdk::signature::Keypair;

pub struct ProgramClient{
    pub client:Arc<Client<Arc<Keypair>>>
}