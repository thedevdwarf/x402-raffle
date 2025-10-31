import { config } from "dotenv";
import express from "express";
import { createWalletClient, http, publicActions, Hex, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { paymentMiddleware, Resource } from "x402-express";
// import { facilitator } from "@coinbase/x402"; // Sorun teşhisi için geçici olarak devre dışı bırakıldı

config();

// Ortam değişkenlerini kontrol et
const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
const cdpApiKeyId = process.env.CDP_API_KEY_ID;
const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;

if (!privateKey || !cdpApiKeyId || !cdpApiKeySecret) {
  throw new Error("Required environment variables for mainnet are not set (PRIVATE_KEY, CDP_API_KEY_ID, CDP_API_KEY_SECRET)");
}

// Hem ödemeleri alacak hem de ödülü gönderecek tek cüzdan
const account = privateKeyToAccount(privateKey);
const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(),
}).extend(publicActions);

const payToAddress = account.address;
console.log(`Raffle wallet address: ${payToAddress}`);

// Bellekte çekiliş verilerini tut
let tickets: string[] = [];
let raffleCount = 1;
let prizePool = 0; // Toplanan ödül miktarını takip et

const app = express();
const PORT = process.env.PORT || 4025; // DigitalOcean için PORT'u ortam değişkeninden al

app.use(express.static('public'));

app.use(
  paymentMiddleware(
    payToAddress,
    {
      "POST /buy-1-ticket": {
        price: "1 USDC",
        network: "base",
        config: {
          description: "Buys 1 raffle ticket.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      },
      "POST /buy-10-tickets": {
        price: "10 USDC",
        network: "base",
        config: {
          description: "Buys 10 raffle tickets.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      },
      "POST /buy-20-tickets": {
        price: "20 USDC",
        network: "base",
        config: {
          description: "Buys 20 raffle tickets.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      },
      "GET /health": {
        price: "1 USDC",
        network: "base",
        config: {
          description: "Checks the server status and current raffle.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      }
    } as any,
    { url: "https://x402.org/facilitator" }, // Genel facilitator'a geri dönüldü
  ),
);

const handleTicketPurchase = async (ticketCount: number, buyerAddress: string) => {
  for (let i = 0; i < ticketCount; i++) {
    tickets.push(buyerAddress);
  }
  console.log(`${ticketCount} ticket(s) purchased by ${buyerAddress}. Total tickets: ${tickets.length}`);
  prizePool += ticketCount; // Her bilet için ödül havuzunu 1$ artır

  if (tickets.length >= 100) {
    drawWinnerAndPay(); // await olmadan çağırarak bir sonraki adıma geç
  }
};

const executePayout = async (winnerAddress: Hex, amount: number, raffleNumber: number) => {
  console.log("Waiting 5 seconds for RPC to sync before payout...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    const usdcContractAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base Mainnet USDC
    const usdcContractAbi = [
      parseAbiItem('function transfer(address to, uint256 amount) returns (bool)'),
    ];
    
    const amountToSend = BigInt(amount * 10**6);
    console.log(`Attempting to send ${amount} USDC to ${winnerAddress} for raffle #${raffleNumber}...`);

    const txHash = await walletClient.writeContract({
      address: usdcContractAddress,
      abi: usdcContractAbi,
      functionName: 'transfer',
      args: [winnerAddress, amountToSend],
    });

    console.log(`Raffle #${raffleNumber} payout successful! Transaction hash: ${txHash}`);
    console.log(`View on explorer: https://basescan.org/tx/${txHash}`);

  } catch (error) {
    console.error(`Raffle #${raffleNumber} payout failed:`, error);
  }
};

const drawWinnerAndPay = () => {
  console.log(`Raffle #${raffleCount} has reached ${tickets.length} tickets! Drawing a winner...`);
  
  const winnerAddress = tickets[Math.floor(Math.random() * tickets.length)] as Hex;
  const finalPrizePool = prizePool;
  const currentRaffleCount = raffleCount;

  console.log(`The winner of raffle #${currentRaffleCount} is ${winnerAddress}! Prize: ${finalPrizePool} USDC.`);

  // Ödemeyi arka planda çalıştır
  executePayout(winnerAddress, finalPrizePool, currentRaffleCount);

  // Çekilişi hemen sıfırla ve bir sonrakine geç
  console.log(`Resetting for raffle #${currentRaffleCount + 1}.`);
  tickets = [];
  prizePool = 0;
  raffleCount++;
};

app.get("/", (req, res) => {
  res.send(`Raffle Server is running! Raffle #${raffleCount} has ${tickets.length} tickets.`);
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    raffleNumber: raffleCount,
    ticketsSold: tickets.length,
    prizePool: prizePool
  });
});

app.post("/buy-1-ticket", async (req: express.Request, res: express.Response) => {
  try {
    const paymentHeader = req.header("x-payment");
    if (!paymentHeader) {
      return res.status(400).json({ error: "x-payment header is missing" });
    }

    const paymentHeaderJson = Buffer.from(paymentHeader, "base64").toString("utf-8");
    const paymentData = JSON.parse(paymentHeaderJson);
    const buyerAddress = paymentData.payload.authorization.from;

    await handleTicketPurchase(1, buyerAddress);
    res.json({ message: `Successfully purchased 1 ticket for ${buyerAddress}!` });
  } catch (error) {
    console.error("Error purchasing ticket:", error);
    res.status(500).json({ error: "Failed to process ticket purchase." });
  }
});

app.post("/buy-10-tickets", async (req: express.Request, res: express.Response) => {
  try {
    const paymentHeader = req.header("x-payment");
    if (!paymentHeader) {
      return res.status(400).json({ error: "x-payment header is missing" });
    }

    const paymentHeaderJson = Buffer.from(paymentHeader, "base64").toString("utf-8");
    const paymentData = JSON.parse(paymentHeaderJson);
    const buyerAddress = paymentData.payload.authorization.from;

    await handleTicketPurchase(10, buyerAddress);
    res.json({ message: `Successfully purchased 10 tickets for ${buyerAddress}!` });
  } catch (error) {
    console.error("Error purchasing ticket:", error);
    res.status(500).json({ error: "Failed to process ticket purchase." });
  }
});

app.post("/buy-20-tickets", async (req: express.Request, res: express.Response) => {
  try {
    const paymentHeader = req.header("x-payment");
    if (!paymentHeader) {
      return res.status(400).json({ error: "x-payment header is missing" });
    }

    const paymentHeaderJson = Buffer.from(paymentHeader, "base64").toString("utf-8");
    const paymentData = JSON.parse(paymentHeaderJson);
    const buyerAddress = paymentData.payload.authorization.from;
    
    await handleTicketPurchase(20, buyerAddress);
    res.json({ message: `Successfully purchased 20 tickets for ${buyerAddress}!` });
  } catch (error) {
    console.error("Error purchasing ticket:", error);
    res.status(500).json({ error: "Failed to process ticket purchase." });
  }
});

app.listen(PORT, () => {
  console.log(`Raffle server listening at http://localhost:${PORT}`);
});