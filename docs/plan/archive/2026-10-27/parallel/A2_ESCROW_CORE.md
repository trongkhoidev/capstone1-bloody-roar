# A2 — Lõi escrow thuần (packages/shared)

**Đọc trước:** [`README.md`](README.md) (quyền sở hữu, hợp đồng, quy tắc chung). Mục 6.1 trong README là chữ ký bắt buộc.
**Branch:** `be/a2-core` · **Worktree:** `/Users/admin/repos/capstone1-wt/a2`
**Ước lượng:** ~9 ngày công.

Đây là phần quan trọng nhất về tiền. Mọi hàm trong plan này là **hàm thuần**: không gọi DB, không gọi RPC, không đọc env. Các agent khác dựa vào đây, nên phải làm xong skeleton trước (mục 2).

---

## 1. Phạm vi

**Được sửa:**
- `packages/shared/**`: `package.json`, `src/index.ts`, `src/escrow/**` (mới), `src/money.ts` (mới), `src/escrow-abi.ts`, `src/constants/**`
- `apps/web/src/test/escrow-core/**` (mới): test cho phần này. Dùng vitest của web vì config của web đã có `include`.
- `apps/contracts/scripts/export-abi.ts` (mới), `apps/contracts/scripts/deploy.ts` (chỉ thêm `deployBlock` vào manifest)
- `apps/contracts/test/foundry/HashVectors.t.sol` (mới)

**Không sửa:** schema, worker, GraphQL, lib của web. Nếu cần thì ghi vào báo cáo.

**Dependency được phép thêm:** `viem` (2.x mới nhất đã phát hành ít nhất 2 tuần) và `canonicalize` (phiên bản đã phát hành ít nhất 2 tuần). Ghi tên và phiên bản vào báo cáo.

**Đầu ra:**
- Skeleton `types.ts`, chữ ký `fold.ts` (mốc 1, trong vài giờ đầu).
- Hashing, EIP-712, calldata, money (mốc 1).
- Fold đầy đủ và test (mốc 2).

---

## 2. Thứ tự làm

1. **Skeleton (làm đầu tiên, mốc 1):** `escrow/types.ts` (`PreparedCall`, `EscrowState`, `DecodedEscrowEvent`, `FoldEffect`, `EventMeta`), `escrow/fold.ts` với chữ ký khớp README mục 6.1 (thân hàm có thể trả `throw new Error("not implemented")`). Push và báo mốc.
2. `money.ts`: `parseTokenAmount`, `formatTokenAmount`, `bpsOf`, `splitPayout`. Có test.
3. `escrow/constants.ts` và BUG-11.
4. `escrow/abi.ts` (BE-30) và `deployBlock` trong `deploy.ts`.
5. `escrow/hashing.ts` (BE-15), kèm test vector và `HashVectors.t.sol`.
6. `escrow/eip712.ts` (BE-32).
7. `escrow/calldata.ts` (BE-33, phần TS).
8. `escrow/events.ts` và `escrow/fold.ts` (BE-41b). Làm theo nhóm event.
9. `escrow/compare.ts` (BE-66, phần thuần), `escrow/reservation-check.ts` (BE-66c, phần thuần).
10. BE-82: test bảng cho fold. Xong mới báo mốc 2.

---

## 3. Task

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BUG-11** | `escrow/constants.ts` dùng số đúng với contract: 7 ngày review, 72 giờ evidence, 7 ngày challenge, 24 giờ final notice, 30 ngày arbiter stall, 250 bps phí. Thêm `PLATFORM_FEE_BPS = 250`. Giữ `PLATFORM_FEE_PERCENT` như alias deprecated, vì file khác còn dùng. Xóa `AI_GUARD_PATTERNS` trong `constants/index.ts` (đã kiểm: không ai import). Thêm test: parse `BloodyRoarEscrow.sol` bằng regex, so từng hằng số với `ESCROW_CONSTANTS`. | Test so khớp pass. `grep -rn AI_GUARD_PATTERNS packages apps` không còn kết quả. |
| **BE-30** | `apps/contracts/scripts/export-abi.ts` đọc artifact Hardhat, ghi `packages/shared/src/escrow/abi.ts`. `escrow-abi.ts` re-export `ESCROW_ABI` để code cũ không gãy. `deploy.ts` thêm `deployBlock` (block của tx deploy) vào manifest. | ABI có đủ 15 event của contract, cộng `Paused`, `Unpaused`, `OwnershipTransferStarted`, `OwnershipTransferred`. |
| **BE-15** | `escrow/hashing.ts`: `canonicalJson` (RFC 8785 qua `canonicalize`), `keccakUtf8` (viem `keccak256` + `toBytes`), `computeTermsHash` theo QĐ-20 (`issueId`, `termsVersion`, `title`, `descriptionSha256`, `category`, tiêu chí đã approve sắp theo id, `token`, `amountRaw`, `deliveryDeadline`, `githubRepo`), `computeDeliveryHash`, `computeEvidenceManifestHash`, `computeDecisionHash`. | Test vector cố định trong `apps/web/src/test/escrow-core/hashing.test.ts`. `HashVectors.t.sol` hash cùng chuỗi, cùng kết quả (tiêu chí M1). |
| **BE-32** | `escrow/eip712.ts`: domain `{name: "BloodyRoarEscrow", version: "1", chainId, verifyingContract}`. Type `FundingIntent {escrowId, client, developer, token, amount, deliveryDeadline, termsHash, intentExpiry, nonce}` (QĐ-18). `recoverFundingIntentSigner` (viem `recoverTypedDataAddress`). Hạn 30 phút do người gọi kiểm. | Test: ký bằng khóa test (sinh bằng `generatePrivateKey`, không hardcode khóa thật), recover đúng địa chỉ. |
| **BE-33** (phần TS) | `escrow/calldata.ts`: `encodeEscrowCall` cho 16 hàm: `deposit`, `submitWork`, `releaseFunds`, `claimMissedDeliveryRefund`, `claimReviewTimeout`, `proposeSettlement`, `revokeSettlement`, `acceptSettlement`, `raiseDispute`, `submitCounterpartyEvidence`, `postInitialRuling`, `challengeRuling`, `postFinalRuling`, `finalizeRuling`, `finalizeArbiterTimeoutSplit`, `claim`. `encodeErc20Approve`. | Test: kết quả bằng `encodeFunctionData` của viem với ABI artifact. |
| **BE-41b** | `escrow/events.ts` (decode) và `escrow/fold.ts`. Fold thuần cho mọi event của contract. Quy tắc suy ra từ `BloodyRoarEscrow.sol` và các test Hardhat (đọc hàm `_resolve`, `deposit`, `raiseDispute`, và các hàm khác). Mỗi quy tắc có ít nhất một test. | Xem BE-82. |
| **BE-82** | `apps/web/src/test/escrow-core/fold.test.ts`: test dạng bảng. Với mỗi event: trạng thái trước → event → trạng thái sau. Số tiền `EscrowResolved` lấy từ event. Phí 2,5% chỉ áp trên phần Developer (QĐ-02). Tổng tiền các bên bằng principal. `claimable` cộng khi resolve, trừ khi `Claimed`. | Test pass. Số lượng test ghi trong báo cáo. |
| **BE-66** (phần thuần) | `escrow/compare.ts`: `compareProjectionWithChain` trả danh sách lệch. `accountedBalance` theo công thức trong contract (`accountedBalance()`, `isSolvent()`). | Test: lệch từng field báo đúng. Số dư đủ thì `isSolvent` là true. |
| **BE-66c** (phần thuần) | `escrow/reservation-check.ts`: `checkDepositAgainstReservation` trả danh sách lý do lệch: client, developer, amount, deadline, termsHash, token. `[]` là khớp. | Test từng lý do. |
| **Money** (hỗ trợ BUG-4) | `money.ts`. `parseTokenAmount("1250.00", 6) = 1250000000n`. Từ chối số âm, nhiều hơn `decimals` chữ số thập phân, chuỗi rỗng, chữ cái. `formatTokenAmount` trả đủ độ chính xác (ví dụ `853.125`). `bpsOf` làm tròn xuống. `splitPayout` theo đúng cách contract làm tròn (kiểm trong `_resolve`). | Test đủ các trường hợp biên. |

---

## 4. Ghi chú về fold

- Input là `state | null`. `null` nghĩa là escrow chưa có. Event đầu tiên của một escrow là `Deposited`.
- Fold không biết reservation. Nó trả `FUNDED` kèm dữ liệu deposit. A4 kiểm bằng `checkDepositAgainstReservation`.
- Event `Paused`, `Unpaused`, `OwnershipTransfer*`, `ArbiterTransferProposed`, `ArbiterUpdated`, `FeeRecipient*` không thuộc escrow cụ thể. Chúng trả effect `GOVERNANCE_CHANGED` hoặc `PAUSE_CHANGED`, không đổi `EscrowState`.
- `projectionVersion` không do fold tăng. Fold trả `state` mới, phần tăng version do A3 làm khi ghi DB.

---

## 5. Kiểm tra trước khi báo cáo

- `bun run --cwd apps/web test` (có thư mục `escrow-core`)
- `bun run typecheck`
- `bun run lint`
- `bun run contracts:test`, và `forge test --match-path test/foundry/HashVectors.t.sol` nếu có foundry

Báo cáo theo mẫu trong `README.md` mục 8, lưu vào `docs/plan/parallel/reports/A2.md`. Ghi tên và phiên bản `viem`, `canonicalize`.
