import { ThirdwebAuth } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";

async function main() {
  const auth = new ThirdwebAuth(
    new PrivateKeyWallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
    "localhost:4000"
  );
  
  const payload = await auth.payload({ address: "0x8a41338669fd9410437bf36f44eb39767e4a0ae0" });
  console.log("PAYLOAD:");
  console.log(payload);

  // Thirdweb's verify actually takes a payload and signature. But the payload must be valid.
  // Wait, does ThirdwebAuth expose a generateMessage function?
  // Let's check if it exists on auth.
  try {
    // @ts-ignore
    const message = auth.generateMessage(payload);
    console.log("GENERATED MESSAGE:");
    console.log(message);
    console.log("MESSAGE LENGTH:", message.length);
  } catch (e) {
    console.log("No generateMessage method");
  }
}

main().catch(console.error);
