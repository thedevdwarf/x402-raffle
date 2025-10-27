# X402 Raffle Server (Standalone)

This server is a standalone version of the X402 raffle application, ready for deployment on platforms like DigitalOcean App Platform, Render, or Fly.io.

## How It Works

- **Ticket Sales**: The server exposes three endpoints to buy tickets: `/buy-1-ticket`, `/buy-10-tickets`, and `/buy-20-tickets`. These are protected by the X402 protocol, requiring a payment in USDC on the Base Mainnet.
- **In-Memory Storage**: For simplicity, this version stores tickets in memory. This means the ticket list will reset if the server restarts. For persistent storage, you would need to integrate a database like PostgreSQL or Redis.
- **Drawing a Winner**: As soon as 100 tickets are sold, the server automatically triggers a draw.
- **Asynchronous Payout**: A random winner is selected, and the server immediately resets for the next raffle. The prize payout (the entire prize pool) is handled as a background task with a 5-second delay to ensure the payment transaction is seen by the RPC.

## Setup for Deployment

1.  **Create a GitHub Repository**:
    Create a new, private GitHub repository and push the contents of this `raffle-server-standalone` folder to it.

2.  **Create a DigitalOcean App**:
    - Go to your DigitalOcean dashboard and create a new "App".
    - Connect your GitHub account and select the repository you just created.
    - DigitalOcean should automatically detect that it's a Node.js project.

3.  **Configure the App**:
    - **Build Command**: `npm run build`
    - **Start Command**: `npm start`
    - **Environment Variables**: This is the most important step. Go to your app's settings and add the following environment variables, using your own secret values:
        - `PRIVATE_KEY`: The private key of the wallet that will both collect funds and pay out the prize. **This wallet must be funded with ETH on Base Mainnet for gas fees and some USDC to handle initial payouts if needed.**
        - `CDP_API_KEY_ID`: Your API Key ID from the Coinbase Developer Platform.
        - `CDP_API_KEY_SECRET`: Your API Key Secret from the Coinbase Developer Platform.

4.  **Deploy**:
    Save your configuration and deploy the app. DigitalOcean will pull your code from GitHub, build the project, and start the server. Your raffle API will then be live!

## Local Development

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Configure Environment**:
    Create a `.env` file by copying `.env.example` and fill in the required values.

3.  **Run the Server**:
    ```bash
    npm run dev