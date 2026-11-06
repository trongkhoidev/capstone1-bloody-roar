import { ethers, type BigNumber, type Contract, type providers, type Wallet } from "./ethers";
import { appendLedger } from "./ledger";
import { assertBaseSepolia } from "../fund";

export interface SafeTxData {
  to: string;
  value: string | number;
  data: string;
  operation?: number;
  safeTxGas?: string | number;
  baseGas?: string | number;
  gasPrice?: string | number;
  gasToken?: string;
  refundReceiver?: string;
  nonce?: number | string;
}

export const SAFE_TX_EIP712_TYPES = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
};

export const SAFE_EXEC_ABI = [
  "function nonce() view returns (uint256)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)",
];

export function computeSafeTxHash(
  safeAddress: string,
  chainId: number,
  tx: SafeTxData,
  nonce: number | string
): string {
  const domain = {
    chainId,
    verifyingContract: safeAddress,
  };

  const message = {
    to: tx.to,
    value: tx.value?.toString() ?? "0",
    data: tx.data || "0x",
    operation: tx.operation ?? 0,
    safeTxGas: tx.safeTxGas?.toString() ?? "0",
    baseGas: tx.baseGas?.toString() ?? "0",
    gasPrice: tx.gasPrice?.toString() ?? "0",
    gasToken: tx.gasToken ?? ethers.constants.AddressZero,
    refundReceiver: tx.refundReceiver ?? ethers.constants.AddressZero,
    nonce: nonce.toString(),
  };

  return ethers.utils._TypedDataEncoder.hash(domain, SAFE_TX_EIP712_TYPES, message);
}

export async function signSafeTx(
  safeAddress: string,
  chainId: number,
  tx: SafeTxData,
  nonce: number | string,
  signer: Wallet
): Promise<{ signerAddress: string; signature: string }> {
  const domain = {
    chainId,
    verifyingContract: safeAddress,
  };

  const message = {
    to: tx.to,
    value: tx.value?.toString() ?? "0",
    data: tx.data || "0x",
    operation: tx.operation ?? 0,
    safeTxGas: tx.safeTxGas?.toString() ?? "0",
    baseGas: tx.baseGas?.toString() ?? "0",
    gasPrice: tx.gasPrice?.toString() ?? "0",
    gasToken: tx.gasToken ?? ethers.constants.AddressZero,
    refundReceiver: tx.refundReceiver ?? ethers.constants.AddressZero,
    nonce: nonce.toString(),
  };

  const signature = await (signer as unknown as {
    _signTypedData: (
      d: unknown,
      t: Record<string, unknown>,
      v: Record<string, unknown>
    ) => Promise<string>;
  })._signTypedData(domain, SAFE_TX_EIP712_TYPES, message);

  return { signerAddress: signer.address, signature };
}

export function buildPackedSignatures(
  signatures: Array<{ signerAddress: string; signature: string }>
): string {
  // Sort signatures ascending by signer address
  const sorted = [...signatures].sort((a, b) =>
    a.signerAddress.toLowerCase().localeCompare(b.signerAddress.toLowerCase())
  );
  let packed = "0x";
  for (const sig of sorted) {
    const raw = sig.signature.startsWith("0x") ? sig.signature.slice(2) : sig.signature;
    packed += raw;
  }
  return packed;
}

export async function executeSafeTransaction(
  safeAddress: string,
  txData: SafeTxData,
  signers: [Wallet, Wallet],
  provider: providers.JsonRpcProvider,
  purpose: string
): Promise<string> {
  if (process.env.CHAIN_ID !== "31337") {
    await assertBaseSepolia(provider);
  }

  const safeContract = new ethers.Contract(safeAddress, SAFE_EXEC_ABI, provider);
  const nonce: BigNumber = await safeContract.nonce();

  const net = await provider.getNetwork();
  const sig1 = await signSafeTx(safeAddress, net.chainId, txData, nonce.toString(), signers[0]);
  const sig2 = await signSafeTx(safeAddress, net.chainId, txData, nonce.toString(), signers[1]);

  const packedSignatures = buildPackedSignatures([sig1, sig2]);

  const executorWallet = signers[0].connect(provider);
  const safeWithSigner = safeContract.connect(executorWallet);

  const tx = await safeWithSigner.execTransaction(
    txData.to,
    txData.value?.toString() ?? "0",
    txData.data || "0x",
    txData.operation ?? 0,
    txData.safeTxGas?.toString() ?? "0",
    txData.baseGas?.toString() ?? "0",
    txData.gasPrice?.toString() ?? "0",
    txData.gasToken ?? ethers.constants.AddressZero,
    txData.refundReceiver ?? ethers.constants.AddressZero,
    packedSignatures
  );

  const receipt = await tx.wait(1);
  if (receipt.status !== 1) {
    throw new Error(`execTransaction failed on-chain: ${tx.hash}`);
  }

  appendLedger({
    ts: new Date().toISOString(),
    from: executorWallet.address,
    to: safeAddress,
    asset: "ETH",
    amount: "0.0",
    txHash: tx.hash,
    purpose: `execTransaction on Safe ${safeAddress}: ${purpose}`,
  });

  return tx.hash;
}
