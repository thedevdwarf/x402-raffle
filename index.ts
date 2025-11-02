import { config } from "dotenv";
config(); // Load environment variables first!

import express from "express";
import path from "path";
import { createWalletClient, http, publicActions, Hex, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { paymentMiddleware, Resource } from "x402-express";
import { facilitator } from "@coinbase/x402";

// Ortam değişkenlerini kontrol et
const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
const useMogami = process.env.USE_MOGAMI_FACILITATOR === 'true';
console.log(`[DEBUG] USE_MOGAMI_FACILITATOR: ${process.env.USE_MOGAMI_FACILITATOR}, useMogami: ${useMogami}`);

let facilitatorConfig: any;

if (useMogami) {
  const facilitatorUrl = process.env.FACILITATOR_URL as Resource | undefined;
  if (!facilitatorUrl) {
    throw new Error("FACILITATOR_URL must be set in .env when USE_MOGAMI_FACILITATOR is true");
  }
  console.log("Using Mogami facilitator.");
  facilitatorConfig = { url: facilitatorUrl };
} else {
  console.log("Using Coinbase facilitator.");
  facilitatorConfig = facilitator;
}

if (!privateKey) {
  throw new Error("Required environment variables are not set. Please create a .env file based on .env.example");
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
const PORT = process.env.PORT || 4021;

app.use(express.static("public"));

app.get("/status", (req, res) => {
  res.send(`Raffle Server is running! Raffle #${raffleCount} has ${tickets.length} tickets.`);
});

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), 'raffle-server-standalone', 'public', 'index.html'));
});

app.use(
  paymentMiddleware(
    payToAddress,
    {
      "GET /weather": {
        price: "$0.0001",
        network: "base",
        config: {
          description: "Gets the current weather.",
          outputSchema: {
            type: "object",
            properties: {
              temperature: { type: "string" },
              condition: { type: "string" }
            }
          }
        }
      },
      "POST /buy-1-ticket": {
        price: "$1",
        network: "base",
        config: {
          description: "Buys 1 raffle ticket.",
          outputSchema: {
            type: "object",
            properties: {
              message: { type: "string" }
            }
          }
        }
      },
      "POST /buy-10-tickets": {
        price: "$10",
        network: "base",
        config: {
          description: "Buys 10 raffle tickets.",
          outputSchema: {
            type: "object",
            properties: {
              message: { type: "string" }
            }
          }
        }
      },
      "POST /buy-100-tickets": {
        price: "$100",
        network: "base",
        config: {
          description: "Buys 100 raffle tickets.",
          outputSchema: {
            type: "object",
            properties: {
              message: { type: "string" }
            }
          }
        }
      },
    } as any,
    facilitatorConfig,
  ),
);

const handleTicketPurchase = async (ticketCount: number, buyerAddress: string) => {
  for (let i = 0; i < ticketCount; i++) {
    tickets.push(buyerAddress);
  }
  console.log(`${ticketCount} ticket(s) purchased by ${buyerAddress}. Total tickets: ${tickets.length}`);
  prizePool += ticketCount; // Her bilet için ödül havuzunu 1$ artır

  if (tickets.length >= 3) { // Test için 3 bilete düşürüldü
    await drawWinnerAndPay();
  }
};

const drawWinnerAndPay = async () => {
  console.log(`Raffle #${raffleCount} has reached ${tickets.length} tickets! Drawing a winner...`);
  
  const winnerAddress = tickets[Math.floor(Math.random() * tickets.length)] as Hex;
  console.log(`The winner of raffle #${raffleCount} is ${winnerAddress}!`);

  console.log("Waiting 5 seconds for RPC to sync...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    const usdcContractAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913'; // Base Mainnet USDC
    const usdcContractAbi = [
      parseAbiItem('function transfer(address to, uint256 amount) returns (bool)'),
    ];
    
    const amountToSend = BigInt(prizePool * 10**6);
    console.log(`Attempting to send ${prizePool} USDC to ${winnerAddress}...`);

    const txHash = await walletClient.writeContract({
      address: usdcContractAddress,
      abi: usdcContractAbi,
      functionName: 'transfer',
      args: [winnerAddress, amountToSend],
    });

    console.log(`Payout successful! Transaction hash: ${txHash}`);
    console.log(`View on explorer: https://basescan.org/tx/${txHash}`);

  } catch (error) {
    console.error("Payout failed:", error);
  } finally {
    // Çekilişi sıfırla
    console.log(`Resetting raffle #${raffleCount}.`);
    tickets = [];
    prizePool = 0;
    raffleCount++;
  }
};


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

app.post("/buy-100-tickets", async (req: express.Request, res: express.Response) => {
  try {
    const paymentHeader = req.header("x-payment");
    if (!paymentHeader) {
      return res.status(400).json({ error: "x-payment header is missing" });
    }

    const paymentHeaderJson = Buffer.from(paymentHeader, "base64").toString("utf-8");
    const paymentData = JSON.parse(paymentHeaderJson);
    const buyerAddress = paymentData.payload.authorization.from;
    
    await handleTicketPurchase(100, buyerAddress);
    res.json({ message: `Successfully purchased 100 tickets for ${buyerAddress}!` });
  } catch (error) {
    console.error("Error purchasing ticket:", error);
    res.status(500).json({ error: "Failed to process ticket purchase." });
  }
});

app.get("/weather", (req, res) => {
  res.json({ temperature: "25°C", condition: "Sunny" });
});

app.listen(PORT, () => {
  console.log(`Raffle server listening at http://localhost:${PORT}`);
});