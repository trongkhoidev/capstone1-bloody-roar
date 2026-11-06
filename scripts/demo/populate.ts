import * as fs from "node:fs";
import * as path from "node:path";
import { ethers } from "./lib/ethers";
import { createColorPng } from "./lib/image";
import { loadState, saveState, type DemoState } from "./lib/state";
import { loginWallet, type UserSession } from "./lib/session";
import { gqlRequest } from "./lib/gql";
import { connectDemoSocket, emitAck } from "./lib/socket";
import { executePreparedCalls, signAndSubmitFunding, type PreparedCall } from "./lib/chain";
import { executeSafeTransaction, type SafeTxData } from "./lib/safe";
import { getDefaultKeysPath, isHardhatMode, KEYS_PATH, loadOrCreateWallets, type WalletStore } from "./wallets";
import {
  CONTENT_DIR,
  getContentDir,
  type ChatRoomContent,
  type CommentContent,
  type IssueContent,
  type ProfileContent,
} from "./generate-content";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PopulateOptions {
  wave?: string;
  dryRun?: boolean;
  baseUrl?: string;
}

export class DemoPopulator {
  private keys: WalletStore;
  private state: DemoState;
  private profiles: ProfileContent[];
  private issues: IssueContent[];
  private comments: CommentContent[];
  private chatRooms: ChatRoomContent[];
  private options: PopulateOptions;
  private token84532Id?: string;

  constructor(options: PopulateOptions = {}) {
    this.options = { baseUrl: process.env.BASE_URL || "http://localhost:4000", ...options };
    const keysPath = getDefaultKeysPath();
    if (!fs.existsSync(keysPath)) {
      this.keys = loadOrCreateWallets(keysPath);
    } else {
      this.keys = JSON.parse(fs.readFileSync(keysPath, "utf-8")) as WalletStore;
    }
    this.state = loadState();

    const contentDir = getContentDir();
    this.profiles = JSON.parse(
      fs.readFileSync(path.join(contentDir, "profiles.json"), "utf-8")
    ) as ProfileContent[];
    this.issues = JSON.parse(
      fs.readFileSync(path.join(contentDir, "issues.json"), "utf-8")
    ) as IssueContent[];
    this.comments = JSON.parse(
      fs.readFileSync(path.join(contentDir, "comments.json"), "utf-8")
    ) as CommentContent[];
    this.chatRooms = JSON.parse(
      fs.readFileSync(path.join(contentDir, "chat.json"), "utf-8")
    ) as ChatRoomContent[];
  }

  private async getSession(role: string): Promise<UserSession> {
    const entry = this.keys[role];
    if (!entry) throw new Error(`Role ${role} not found in keys store`);
    return loginWallet(role, entry.privateKey, this.options.baseUrl);
  }

  // Helper to upload a PNG file using 2-step presigned/local upload flow
  private async uploadPng(
    session: UserSession,
    purpose: "AVATAR" | "ISSUE_IMAGE" | "DELIVERY" | "EVIDENCE",
    pngBuffer: Buffer,
    filename: string,
    issueId?: string
  ): Promise<{ attachmentId: string; fileUrl: string }> {
    const baseUrl = this.options.baseUrl || process.env.BASE_URL || "http://localhost:4000";
    const initRes = await fetch(`${baseUrl}/api/uploads`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: session.cookie,
        "x-forwarded-for": session.ip,
      },
      body: JSON.stringify({
        fileName: filename,
        fileType: "image/png",
        fileSize: pngBuffer.length,
        purpose,
        ...(issueId ? { issueId } : {}),
      }),
    });

    if (!initRes.ok) {
      const errText = await initRes.text();
      throw new Error(`Upload init failed: HTTP ${initRes.status} - ${errText}`);
    }

    const { attachmentId, uploadUrl, fileUrl } = (await initRes.json()) as {
      attachmentId: string;
      uploadUrl: string;
      fileUrl: string;
    };

    // Upload the binary payload
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "content-type": "image/png",
        cookie: session.cookie,
        "x-forwarded-for": session.ip,
      },
      body: pngBuffer,
    });

    if (!putRes.ok) {
      throw new Error(`Upload PUT failed: HTTP ${putRes.status}`);
    }

    // Complete upload
    const completeRes = await fetch(`${baseUrl}/api/uploads/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: session.cookie,
        "x-forwarded-for": session.ip,
      },
      body: JSON.stringify({ attachmentId }),
    });

    if (!completeRes.ok) {
      throw new Error(`Upload complete failed: HTTP ${completeRes.status}`);
    }

    return { attachmentId, fileUrl };
  }

  // WAVE 1: Update user profiles and upload avatars
  public async runWave1(): Promise<{ updatedCount: number }> {
    console.log(`=== Wave 1: Profiles & Avatars (${this.profiles.length} wallets) ===`);
    let count = 0;

    for (const p of this.profiles) {
      if (this.state.profilesUpdated[p.role]) {
        count++;
        continue;
      }

      if (this.options.dryRun) {
        console.log(`[DRY-RUN] Would update profile for ${p.role}: ${p.name}`);
        count++;
        continue;
      }

      const session = await this.getSession(p.role);

      // Generate a distinct colored avatar
      const colorSeed = parseInt(p.role.replace(/\D/g, ""), 10) * 23;
      const r = (colorSeed * 37) % 200 + 40;
      const g = (colorSeed * 53) % 200 + 40;
      const b = (colorSeed * 71) % 200 + 40;
      const avatarBuffer = createColorPng(64, 64, r, g, b);

      let avatarUrl: string | undefined;
      try {
        const uploadResult = await this.uploadPng(session, "AVATAR", avatarBuffer, `${p.role}-avatar.png`);
        avatarUrl = uploadResult.fileUrl;
      } catch (err) {
        console.warn(`Avatar upload skipped for ${p.role}:`, err);
      }

      await gqlRequest(
        `mutation UpdateProfile($input: UpdateProfileInput!) {
          updateProfile(input: $input) {
            id
            name
            bio
          }
        }`,
        {
          input: {
            name: p.name,
            bio: p.bio,
            skills: p.skills,
            avatar: avatarUrl,
            ...(p.location ? { location: p.location } : {}),
            ...(p.displayRole ? { role: p.displayRole } : {}),
          },
        },
        { cookie: session.cookie, ip: session.ip, baseUrl: this.options.baseUrl }
      );

      this.state.profilesUpdated[p.role] = true;
      saveState(this.state);
      count++;
      console.log(`Updated profile for ${p.role}: ${p.name} (${count}/${this.profiles.length})`);
    }

    return { updatedCount: count };
  }

  private async ensureTargetTokenId(): Promise<string> {
    if (this.token84532Id) return this.token84532Id;
    const targetChainId = Number(process.env.CHAIN_ID || 84532);
    const authRole = isHardhatMode() ? "hh04" : "user01";
    const session = await this.getSession(authRole);
    const tokensRes = await gqlRequest<{ tokens: Array<{ id: string; chainId: number; symbol: string; isActive?: boolean }> }>(
      `query { tokens { id chainId symbol isActive } }`,
      {},
      { cookie: session.cookie, ip: session.ip, baseUrl: this.options.baseUrl }
    );
    const token = targetChainId === 31337
      ? tokensRes.tokens.find((t) => t.chainId === 31337 && t.isActive)
      : tokensRes.tokens.find((t) => t.chainId === 84532 && t.symbol === "USDC");
    if (!token) throw new Error(`Token for chain ${targetChainId} not found in database`);
    this.token84532Id = token.id;
    return token.id;
  }

  // WAVE 2: Create issues across 9 categories
  public async runWave2(): Promise<{ createdIssuesCount: number }> {
    console.log(`=== Wave 2: Issues (${this.issues.length} issues across 9 categories) ===`);
    let count = 0;

    // Discover token ID for target chain if not cached
    if (!this.options.dryRun) {
      await this.ensureTargetTokenId();
    }

    for (const item of this.issues) {
      if (this.state.issues[item.key]) {
        count++;
        continue;
      }

      if (this.options.dryRun) {
        count++;
        continue;
      }

      const session = await this.getSession(item.clientRole);

      // Create issue
      const issueRes = await gqlRequest<{ createIssue: { id: string } }>(
        `mutation CreateIssue($input: CreateIssueInput!) {
          createIssue(input: $input) {
            id
          }
        }`,
        {
          input: {
            title: item.title,
            description: item.description,
            category: item.category,
            bountyAmount: item.bountyAmount.toString(),
            tokenId: this.token84532Id,
            requiredSkills: item.requiredSkills,
            difficulty: item.difficulty,
            timeEstimate: item.timeEstimate,
            githubRepo: item.githubRepo,
          },
        },
        { cookie: session.cookie, ip: session.ip, baseUrl: this.options.baseUrl }
      );

      const issueId = issueRes.createIssue.id;
      this.state.issues[item.key] = issueId;
      this.state.issueMetadata[item.key] = {
        id: issueId,
        clientRole: item.clientRole,
        category: item.category,
        bountyAmount: item.bountyAmount.toString(),
      };

      // If issue has attachment, upload and attach image
      if (item.hasAttachment) {
        try {
          const imgBuffer = createColorPng(120, 80, 50, 120, 200);
          const uploadResult = await this.uploadPng(session, "ISSUE_IMAGE", imgBuffer, `${item.key}-preview.png`);
          await gqlRequest(
            `mutation AttachFile($issueId: ID!, $attachmentId: ID!) {
              attachIssueFile(issueId: $issueId, attachmentId: $attachmentId) {
                id
              }
            }`,
            { issueId, attachmentId: uploadResult.attachmentId },
            { cookie: session.cookie, ip: session.ip, baseUrl: this.options.baseUrl }
          ).catch(() => {});
        } catch {
          // Non-critical attachment failure
        }
      }

      // If issue has test criteria, add and approve them
      if (item.testCases) {
        for (const tc of item.testCases) {
          try {
            const tcRes = await gqlRequest<{ createTestCase: { id: string } }>(
              `mutation AddCase($input: CreateTestCaseInput!) {
                createTestCase(input: $input) {
                  id
                }
              }`,
              {
                input: {
                  issueId,
                  title: tc.title,
                  description: tc.description,
                  given: tc.given,
                  when: tc.when,
                  then: tc.then,
                  priority: tc.priority,
                  isEdgeCase: tc.isEdgeCase,
                },
              },
              { cookie: session.cookie, ip: session.ip, baseUrl: this.options.baseUrl }
            );

            // Approve test case
            await gqlRequest(
              `mutation ApproveCase($input: UpdateTestCaseInput!) {
                updateTestCase(input: $input) {
                  id
                  isApproved
                }
              }`,
              {
                input: {
                  id: tcRes.createTestCase.id,
                  isApproved: true,
                },
              },
              { cookie: session.cookie, ip: session.ip, baseUrl: this.options.baseUrl }
            );
          } catch (err) {
            console.warn(`Failed to add/approve test case for ${item.key}:`, err);
          }
        }
      }

      saveState(this.state);
      count++;
      if (count % 20 === 0) {
        console.log(`Created ${count}/${this.issues.length} issues...`);
      }
    }

    return { createdIssuesCount: count };
  }

  // WAVE 3: Comments and replies
  public async runWave3(): Promise<{ commentsCount: number }> {
    console.log(`=== Wave 3: Comments (${this.comments.length} comments) ===`);
    let count = 0;

    for (const c of this.comments) {
      if (this.state.comments[c.key]) {
        count++;
        continue;
      }

      if (this.options.dryRun) {
        count++;
        continue;
      }

      const issueKey = `issue_${String(c.issueIndex).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId && !this.options.dryRun) continue;

      const session = await this.getSession(c.authorRole);

      // Record view from this user
      await gqlRequest(
        `mutation RecordView($id: ID!) {
          recordIssueView(issueId: $id)
        }`,
        { id: issueId },
        { cookie: session.cookie, ip: session.ip, baseUrl: this.options.baseUrl }
      ).catch(() => {});

      // Add comment
      const commentRes = await gqlRequest<{ createIssueComment: { id: string } }>(
        `mutation AddComment($input: CreateIssueCommentInput!) {
          createIssueComment(input: $input) {
            id
          }
        }`,
        {
          input: {
            issueId,
            body: c.body,
          },
        },
        { cookie: session.cookie, ip: session.ip, baseUrl: this.options.baseUrl }
      );

      this.state.comments[c.key] = commentRes.createIssueComment.id;
      saveState(this.state);
      count++;
      if (count % 50 === 0) {
        console.log(`Posted ${count}/500 comments...`);
      }
    }

    return { commentsCount: count };
  }

  // WAVE 4: Applications
  public async runWave4(): Promise<{ appliedCount: number; withdrawnCount: number; rejectedCount: number }> {
    const isHardhat = isHardhatMode();
    const targetApps = isHardhat ? 600 : 350;
    const targetWithdraws = isHardhat ? 20 : 15;
    const targetRejects = isHardhat ? 20 : 20;
    const issuesLimit = isHardhat ? 200 : 150;

    console.log(`=== Wave 4: Applications (${targetApps} applications, ${targetWithdraws} withdraws, ${targetRejects} rejects) ===`);
    let applied = 0;
    let withdrawn = 0;
    let rejected = 0;

    const devRoles = isHardhat
      ? Object.keys(this.keys).filter((k) => k.startsWith("hh"))
      : Array.from({ length: 22 }, (_, i) => `user${String(i + 11).padStart(2, "0")}`);

    let appIdx = 0;
    for (let i = 1; i <= issuesLimit; i++) {
      if (applied >= targetApps) break;
      const issueKey = `issue_${String(i).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId && !this.options.dryRun) continue;

      const metadata = this.state.issueMetadata[issueKey];
      const clientRole = metadata?.clientRole || (isHardhat ? "hh04" : "user01");
      const candidatePool = devRoles.filter((r) => r !== clientRole);

      const numApplicants = isHardhat
        ? (i <= 60 ? 3 + (i % 2) : 2 + (i % 3))
        : (i <= 45 ? 1 + (i % 4) : (i % 6));

      for (let a = 0; a < numApplicants; a++) {
        if (applied >= targetApps) break;
        appIdx++;
        const appKey = `app_${String(appIdx).padStart(4, "0")}`;
        const devRole = candidatePool[(i + a) % candidatePool.length]!;

        if (this.state.applications[appKey] && !this.options.dryRun) {
          applied++;
          continue;
        }

        if (this.options.dryRun) {
          applied++;
          if (appIdx <= targetWithdraws) withdrawn++;
          if (appIdx > targetWithdraws && appIdx <= targetWithdraws + targetRejects) rejected++;
          continue;
        }

        const devSession = await this.getSession(devRole);

        const appRes = await gqlRequest<{ applyToIssue: { id: string } }>(
          `mutation Apply($input: ApplyToIssueInput!) {
            applyToIssue(input: $input) {
              id
            }
          }`,
          {
            input: {
              issueId,
              message: `Tôi có kinh nghiệm chuyên sâu với ${metadata?.category || "yêu cầu này"}. Cam kết hoàn thành đúng tiêu chí nghiệm thu.`,
            },
          },
          { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
        );

        const appId = appRes.applyToIssue.id;
        this.state.applications[appKey] = appId;
        applied++;

        // Withdraws
        if (withdrawn < targetWithdraws && appIdx <= targetWithdraws) {
          await gqlRequest(
            `mutation Withdraw($id: ID!) {
              withdrawApplication(id: $id) {
                id
                status
              }
            }`,
            { id: appId },
            { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
          ).catch(() => {});
          withdrawn++;
        }

        // Rejections by client
        if (rejected < targetRejects && appIdx > targetWithdraws && appIdx <= targetWithdraws + targetRejects) {
          const clientSession = await this.getSession(clientRole);
          await gqlRequest(
            `mutation Reject($id: ID!) {
              rejectApplication(id: $id) {
                id
                status
              }
            }`,
            { id: appId },
            { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
          ).catch(() => {});
          rejected++;
        }

        saveState(this.state);
        if (applied % 50 === 0) {
          console.log(`Submitted ${applied}/${targetApps} applications...`);
        }
      }
    }

    console.log(`Applications completed: ${applied} applied, ${withdrawn} withdrawn, ${rejected} rejected.`);
    return { appliedCount: applied, withdrawnCount: withdrawn, rejectedCount: rejected };
  }

  // WAVE 5: selectDeveloper and escrow deposits (60 selected, 50 funded, 5 awaiting, 5 cancelled in hardhat mode)
  public async runWave5(): Promise<{ selectedCount: number; fundedCount: number; cancelledCount: number }> {
    const isHardhat = isHardhatMode();
    const totalReservations = isHardhat ? 60 : 45;
    const fundedTarget = isHardhat ? 50 : 35;
    const awaitingTarget = isHardhat ? 5 : 6;
    const cancelledTarget = isHardhat ? 5 : 4;

    console.log(`=== Wave 5: Reservations & Escrow Deposits (${totalReservations} selected, ${fundedTarget} funded, ${cancelledTarget} cancelled) ===`);
    let selected = 0;
    let funded = 0;
    let cancelled = 0;

    for (let r = 1; r <= totalReservations; r++) {
      const issueKey = `issue_${String(r).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId && !this.options.dryRun) continue;

      const metadata = this.state.issueMetadata[issueKey];
      const clientRole = metadata?.clientRole || (isHardhat ? "hh04" : "user01");
      const devRole = isHardhat
        ? `hh${String(4 + ((r * 3) % 46)).padStart(2, "0")}`
        : `user${String(11 + (r % 22)).padStart(2, "0")}`;

      if (this.options.dryRun) {
        selected++;
        if (r <= fundedTarget) funded++;
        if (r > fundedTarget + awaitingTarget && r <= fundedTarget + awaitingTarget + cancelledTarget) cancelled++;
        continue;
      }

      // Check if reservation already exists in state
      if (!this.state.reservations[issueKey]) {
        const clientSession = await this.getSession(clientRole);

        // Find a pending application for this issue
        const appsRes = await gqlRequest<{ applications: Array<{ id: string; status: string }> }>(
          `query GetApps($issueId: String!) {
            applications(issueId: $issueId) {
              id
              status
            }
          }`,
          { issueId },
          { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
        ).catch(() => null);
        let pendingApp = appsRes?.applications?.find((a) => a.status === "PENDING");
        if (!pendingApp) {
          const candidateRoles = isHardhat
            ? Object.keys(this.keys).filter((k) => k.startsWith("hh") && k !== clientRole)
            : Array.from({ length: 22 }, (_, d) => `user${String(d + 11).padStart(2, "0")}`).filter((k) => k !== clientRole);
          for (const candidateRole of candidateRoles) {
            const devSession = await this.getSession(candidateRole);
            const appRes = await gqlRequest<{ applyToIssue: { id: string } }>(
              `mutation Apply($input: ApplyToIssueInput!) {
                applyToIssue(input: $input) { id }
              }`,
              {
                input: {
                  issueId,
                  message: "Sẵn sàng nhận và triển khai ngay nhiệm vụ theo cam kết chất lượng.",
                },
              },
              { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
            ).catch(() => null);
            if (appRes) {
              pendingApp = { id: appRes.applyToIssue.id, status: "PENDING" };
              break;
            }
          }
        }
        const appId = pendingApp?.id;
        if (!appId) continue;

        // Ensure issue has at least one approved test criteria for selectDeveloper
        const tcRes = await gqlRequest<{ createTestCase: { id: string } }>(
          `mutation AddCase($input: CreateTestCaseInput!) {
            createTestCase(input: $input) { id }
          }`,
          {
            input: {
              issueId,
              title: "Nghiệm thu hoàn tất chức năng",
              description: "Đảm bảo tính năng hoạt động đúng theo đặc tả",
              given: "Môi trường và dữ liệu khởi tạo sẵn",
              when: "Thực thi tính năng theo hướng dẫn",
              then: "Kết quả trả về chính xác không phát sinh lỗi",
            },
          },
          { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
        ).catch(() => null);
        if (tcRes) {
          await gqlRequest(
            `mutation ApproveCase($input: UpdateTestCaseInput!) {
              updateTestCase(input: $input) { id isApproved }
            }`,
            { input: { id: tcRes.createTestCase.id, isApproved: true } },
            { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
          ).catch(() => null);
        }

        const deadline = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
        try {
          const selectRes = await gqlRequest<{ selectDeveloper: { id: string } }>(
            `mutation SelectDev($issueId: ID!, $applicationId: ID!, $deliveryDeadline: String!) {
              selectDeveloper(issueId: $issueId, applicationId: $applicationId, deliveryDeadline: $deliveryDeadline) {
                id
              }
            }`,
            { issueId, applicationId: appId, deliveryDeadline: deadline },
            { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
          );

          this.state.reservations[issueKey] = {
            id: selectRes.selectDeveloper.id,
            status: "AWAITING_FUNDING",
            issueId: issueId || "",
            developerRole: devRole,
          };
          selected++;
        } catch (err) {
          console.warn(`selectDeveloper error for ${issueKey}:`, err);
          continue;
        }
      }

      const resObj = this.state.reservations[issueKey]!;

      // Cancelled reservations
      if (r > fundedTarget + awaitingTarget && r <= fundedTarget + awaitingTarget + cancelledTarget && resObj.status === "AWAITING_FUNDING") {
        const clientSession = await this.getSession(clientRole);
        try {
          await gqlRequest(
            `mutation CancelRes($id: ID!) {
              cancelReservation(reservationId: $id) {
                id
                status
              }
            }`,
            { id: resObj.id },
            { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
          );
          resObj.status = "CANCELLED";
          cancelled++;
        } catch (err) {
          console.warn(`cancelReservation error:`, err);
        }
      }

      // Funded on-chain
      if (r <= fundedTarget && resObj.status === "AWAITING_FUNDING") {
        const clientSession = await this.getSession(clientRole);
        try {
          const resDetail = await gqlRequest<{
            reservation: {
              id: string;
              chainId: number;
              contractAddress: string;
              tokenAddress: string;
              escrowKey: string;
              termsHash: string;
              amountRaw: string;
              deliveryDeadline: string;
              developerWallet: string;
            };
          }>(
            `query GetRes($issueId: ID!) {
              reservation(issueId: $issueId) {
                id
                chainId
                contractAddress
                tokenAddress
                escrowKey
                termsHash
                amountRaw
                deliveryDeadline
                developerWallet
              }
            }`,
            { issueId },
            { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
          );

          if (!resDetail.reservation) {
            console.warn(`No active reservation found for ${issueKey}`);
            continue;
          }

          const devWallet = resDetail.reservation.developerWallet;
          const matchedDevRole = Object.entries(this.keys).find(([_, v]) => v.address.toLowerCase() === devWallet.toLowerCase())?.[0];
          if (matchedDevRole) {
            resObj.developerRole = matchedDevRole;
          }

          const calls = await signAndSubmitFunding(
            clientSession.wallet,
            resDetail.reservation,
            devWallet,
            clientSession,
            this.options.baseUrl
          );

          // Execute prepared calls on-chain
          await executePreparedCalls(
            clientSession.wallet,
            calls,
            clientSession,
            `Deposit escrow for ${issueKey}`,
            this.options.baseUrl
          );

          // Allow worker indexer to index EscrowDeposited event
          await sleep(2000);

          resObj.status = "FUNDED";
          funded++;
        } catch (err) {
          console.warn(`Funding on-chain skipped/failed for ${issueKey}:`, err);
        }
      }

      saveState(this.state);
    }

    return { selectedCount: selected, fundedCount: funded, cancelledCount: cancelled };
  }

  // WAVE 6: Task chat in rooms (files, replies, text)
  public async runWave6(): Promise<{ roomsProcessed: number }> {
    console.log(`=== Wave 6: Realtime Chat (${this.chatRooms.length} rooms) ===`);
    let processed = 0;

    for (const room of this.chatRooms) {
      if (this.state.chatRooms[room.issueKey]) {
        processed++;
        continue;
      }

      if (this.options.dryRun) {
        processed++;
        continue;
      }

      const issueId = this.state.issues[room.issueKey];
      if (!issueId && !this.options.dryRun) continue;

      const issueDef = this.issues.find((i) => i.key === room.issueKey);
      const clientRole = issueDef?.clientRole || this.state.issueMetadata[room.issueKey]?.clientRole || room.clientRole;
      const devRole = this.state.reservations[room.issueKey]?.developerRole || room.developerRole;

      const clientSession = await this.getSession(clientRole);
      const devSession = await this.getSession(devRole);

      try {
        const clientSocket = await connectDemoSocket(clientSession.cookie, clientSession.ip, this.options.baseUrl);
        const devSocket = await connectDemoSocket(devSession.cookie, devSession.ip, this.options.baseUrl);

        // Join room
        await emitAck(clientSocket, "task:join", issueId);
        await emitAck(devSocket, "task:join", issueId);

        for (const msg of room.messages) {
          const isClientMsg = msg.senderRole === room.clientRole || msg.senderRole === clientRole;
          const senderSocket = isClientMsg ? clientSocket : devSocket;
          const senderSession = isClientMsg ? clientSession : devSession;

          if ((msg as { hasFile?: boolean }).hasFile) {
            try {
              const imgBuffer = createColorPng(64, 64, 40, 140, 210);
              const { fileUrl } = await this.uploadPng(senderSession, "ISSUE_IMAGE", imgBuffer, "benchmark-log.png");
              await emitAck(senderSocket, "message:send", {
                issueId,
                content: msg.text,
                type: "FILE",
                fileUrl,
                fileName: "benchmark-log.png",
                fileSize: imgBuffer.length,
                fileMime: "image/png",
              });
            } catch {
              await emitAck(senderSocket, "message:send", {
                issueId,
                content: msg.text,
                type: "TEXT",
              });
            }
          } else {
            await emitAck(senderSocket, "message:send", {
              issueId,
              content: msg.text,
              type: "TEXT",
            });
          }
          // Small delay to respect rate limit (10 msgs per 10s)
          await sleep(250);
        }

        clientSocket.disconnect();
        devSocket.disconnect();

        this.state.chatRooms[room.issueKey] = {
          issueId: issueId || "",
          messagesCount: room.messages.length,
        };
        saveState(this.state);
        processed++;
      } catch (err) {
        console.warn(`Chat room skipped/failed for ${room.issueKey}:`, err);
      }
    }

    return { roomsProcessed: processed };
  }

  // WAVE 7: Submissions (40 submissions in hardhat mode, 10 requestChanges then resubmitted)
  public async runWave7(): Promise<{ submittedCount: number; revisedCount: number }> {
    const isHardhat = isHardhatMode();
    const targetSubmissions = isHardhat ? 40 : 28;
    const targetRevisions = isHardhat ? 10 : 5;

    console.log(`=== Wave 7: Submissions (${targetSubmissions} submissions, ${targetRevisions} requestChanges) ===`);
    let submitted = 0;
    let revised = 0;

    for (let s = 1; s <= targetSubmissions; s++) {
      const issueKey = `issue_${String(s).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId && !this.options.dryRun) continue;

      if (this.state.submissions[issueKey]) {
        submitted++;
        if (s <= targetRevisions) revised++;
        continue;
      }

      if (this.options.dryRun) {
        submitted++;
        if (s <= targetRevisions) revised++;
        continue;
      }

      const resObj = this.state.reservations[issueKey];
      const devRole = resObj?.developerRole || (isHardhat ? "hh15" : `user${String(11 + (s % 22)).padStart(2, "0")}`);
      const clientRole = this.state.issueMetadata[issueKey]?.clientRole || (isHardhat ? "hh04" : "user01");

      const devSession = await this.getSession(devRole);
      try {
        const draftRes = await gqlRequest<{ createSubmissionDraft: { id: string } }>(
          `mutation Draft($issue: ID!, $description: String!) {
            createSubmissionDraft(issueId: $issue, description: $description) {
              id
            }
          }`,
          {
            issue: issueId,
            description: `Hoàn tất toàn bộ yêu cầu của bài #${s}. Đã kèm đầy đủ unit test và verification log.`,
          },
          { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
        );

        const subId = draftRes.createSubmissionDraft.id;

        const prepRes = await gqlRequest<{ prepareSubmitWork: PreparedCall }>(
          `mutation PrepSubmit($id: ID!) {
            prepareSubmitWork(submissionId: $id) {
              intentId
              contractAddress
              data
              value
            }
          }`,
          { id: subId },
          { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
        );

        await executePreparedCalls(
          devSession.wallet,
          [prepRes.prepareSubmitWork],
          devSession,
          `Submit work for ${issueKey}`,
          this.options.baseUrl
        );

        await sleep(1500);

        // Issues get requestChanges then resubmitted
        if (s <= targetRevisions) {
          const clientSession = await this.getSession(clientRole);
          await gqlRequest(
            `mutation ReqChanges($id: ID!, $notes: String!) {
              requestChanges(submissionId: $id, notes: $notes) {
                changesRequested
              }
            }`,
            { id: subId, notes: "Cần bổ sung thêm test case cho edge case concurrency." },
            { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
          ).catch((err) => {
            console.warn(`requestChanges warning for ${issueKey}:`, err);
          });
          revised++;

          await sleep(1500);

          // Dev submits revision
          const revDraftRes = await gqlRequest<{ createSubmissionDraft: { id: string } }>(
            `mutation Draft($issue: ID!, $description: String!) {
              createSubmissionDraft(issueId: $issue, description: $description) {
                id
              }
            }`,
            {
              issue: issueId,
              description: `Bản nộp đã chỉnh sửa: Bổ sung 5 test case concurrency và xử lý lỗi bộ nhớ.`,
            },
            { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
          ).catch(() => null);

          if (revDraftRes) {
            const revPrep = await gqlRequest<{ prepareSubmitWork: PreparedCall }>(
              `mutation PrepSubmit($id: ID!) {
                prepareSubmitWork(submissionId: $id) {
                  intentId
                  contractAddress
                  data
                  value
                }
              }`,
              { id: revDraftRes.createSubmissionDraft.id },
              { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
            ).catch(() => null);

            if (revPrep) {
              await executePreparedCalls(
                devSession.wallet,
                [revPrep.prepareSubmitWork],
                devSession,
                `Resubmit work for ${issueKey}`,
                this.options.baseUrl
              ).catch(() => {});
              await sleep(1500);
            }
          }
        }

        this.state.submissions[issueKey] = subId;
        submitted++;
        saveState(this.state);
      } catch (err) {
        console.warn(`Submission error for ${issueKey}:`, err);
      }
    }

    return { submittedCount: submitted, revisedCount: revised };
  }

  // WAVE 8: Escrow Outcomes
  public async runWave8(): Promise<{ releases: number; settlements: number; disputes: number }> {
    const isHardhat = isHardhatMode();
    const releaseTarget = isHardhat ? 25 : 16;
    const settlementStart = releaseTarget + 1;
    const settlementEnd = isHardhat ? 31 : 21;
    const openDisputeStart = settlementEnd + 1;
    const openDisputeEnd = isHardhat ? 35 : 23;
    const initRulingStart = openDisputeEnd + 1;
    const initRulingEnd = isHardhat ? 38 : 25;
    const finalRulingStart = initRulingEnd + 1;
    const finalRulingEnd = isHardhat ? 41 : 28;
    const missedDeliveryStart = isHardhat ? 42 : 29;
    const missedDeliveryEnd = isHardhat ? 43 : 30;
    const reviewTimeoutStart = isHardhat ? 44 : 31;
    const reviewTimeoutEnd = isHardhat ? 45 : 32;

    console.log(`=== Wave 8: Escrow Outcomes (${releaseTarget} Releases, ${settlementEnd - settlementStart + 1} Settlements, 4 Open Disputes, 3 Initial Rulings, 3 Finalized, 2 Refunds, 2 Review-Timeouts) ===`);
    let releases = 0;
    let settlements = 0;
    let disputes = 0;

    if (this.options.dryRun) {
      return { releases: releaseTarget, settlements: settlementEnd - settlementStart + 1, disputes: 10 };
    }

    // 1. Release funds for issues 1..releaseTarget
    for (let i = 1; i <= releaseTarget; i++) {
      const issueKey = `issue_${String(i).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId) continue;

      const clientRole = this.state.issueMetadata[issueKey]?.clientRole || (isHardhat ? "hh04" : "user01");
      const devRole = this.state.reservations[issueKey]?.developerRole || (isHardhat ? "hh11" : "user11");
      const clientSession = await this.getSession(clientRole);
      const devSession = await this.getSession(devRole);

      try {
        const relRes = await gqlRequest<{ prepareReleaseFunds: PreparedCall }>(
          `mutation Rel($id: ID!) {
            prepareReleaseFunds(issueId: $id) {
              intentId
              contractAddress
              data
              value
            }
          }`,
          { id: issueId },
          { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
        );

        await executePreparedCalls(
          clientSession.wallet,
          [relRes.prepareReleaseFunds],
          clientSession,
          `Release escrow for ${issueKey}`,
          this.options.baseUrl
        );
        releases++;
        await sleep(2000);

        // Developer claims claimable balance
        try {
          const claimRes = await gqlRequest<{ prepareClaim: PreparedCall }>(
            `mutation Claim($id: ID!) {
              prepareClaim(issueId: $id) {
                intentId
                contractAddress
                data
                value
              }
            }`,
            { id: issueId },
            { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
          );
          await executePreparedCalls(
            devSession.wallet,
            [claimRes.prepareClaim],
            devSession,
            `Claim funds for ${issueKey}`,
            this.options.baseUrl
          );
          await sleep(1500);
        } catch (err) {
          console.warn(`Claim error for ${issueKey}:`, err);
        }
      } catch (err) {
        console.warn(`Release on-chain skipped/failed for ${issueKey}:`, err);
      }
    }

    // 2. Propose and accept settlements for issues settlementStart..settlementEnd
    for (let i = settlementStart; i <= settlementEnd; i++) {
      const issueKey = `issue_${String(i).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId) continue;

      const clientRole = this.state.issueMetadata[issueKey]?.clientRole || (isHardhat ? "hh04" : "user01");
      const devRole = this.state.reservations[issueKey]?.developerRole || (isHardhat ? "hh11" : "user11");
      const clientSession = await this.getSession(clientRole);
      const devSession = await this.getSession(devRole);

      try {
        const prop = await gqlRequest<{ prepareProposeSettlement: PreparedCall }>(
          `mutation($id: ID!, $bps: Int!) { prepareProposeSettlement(issueId: $id, clientBps: $bps) { intentId contractAddress data value } }`,
          { id: issueId, bps: 5000 },
          { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
        );
        await executePreparedCalls(clientSession.wallet, [prop.prepareProposeSettlement], clientSession, `Propose settlement ${issueKey}`, this.options.baseUrl);
        await sleep(2000);

        const acc = await gqlRequest<{ prepareAcceptSettlement: PreparedCall }>(
          `mutation($id: ID!) { prepareAcceptSettlement(issueId: $id) { intentId contractAddress data value } }`,
          { id: issueId },
          { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
        );
        await executePreparedCalls(devSession.wallet, [acc.prepareAcceptSettlement], devSession, `Accept settlement ${issueKey}`, this.options.baseUrl);
        await sleep(1500);
        settlements++;
      } catch (err) {
        console.warn(`Settlement failed for ${issueKey}:`, err);
      }
    }

    // 3. Open disputes for issues openDisputeStart..openDisputeEnd (leave in DISPUTED)
    for (let i = openDisputeStart; i <= openDisputeEnd; i++) {
      const issueKey = `issue_${String(i).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId) continue;

      const clientRole = this.state.issueMetadata[issueKey]?.clientRole || (isHardhat ? "hh04" : "user01");
      const clientSession = await this.getSession(clientRole);

      try {
        const ev = await gqlRequest<{ createEvidenceManifest: { id: string } }>(
          `mutation($issue: ID!, $stmt: String!) { createEvidenceManifest(issueId: $issue, statement: $stmt) { id } }`,
          { issue: issueId, stmt: "Sản phẩm bàn giao không đạt tiêu chuẩn kỹ thuật yêu cầu trong mô tả." },
          { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
        );
        const raise = await gqlRequest<{ prepareRaiseDispute: PreparedCall }>(
          `mutation($issue: ID!, $man: ID!) { prepareRaiseDispute(issueId: $issue, manifestId: $man) { intentId contractAddress data value } }`,
          { issue: issueId, man: ev.createEvidenceManifest.id },
          { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
        );
        await executePreparedCalls(clientSession.wallet, [raise.prepareRaiseDispute], clientSession, `Raise dispute ${issueKey}`, this.options.baseUrl);
        await sleep(2000);
        disputes++;
      } catch (err) {
        console.warn(`Open dispute failed for ${issueKey}:`, err);
      }
    }

    // 4. Disputes with initial ruling and final ruling
    for (let i = initRulingStart; i <= finalRulingEnd; i++) {
      const issueKey = `issue_${String(i).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId) continue;

      const clientRole = this.state.issueMetadata[issueKey]?.clientRole || (isHardhat ? "hh04" : "user01");
      const devRole = this.state.reservations[issueKey]?.developerRole || (isHardhat ? "hh11" : "user11");
      const clientSession = await this.getSession(clientRole);
      const devSession = await this.getSession(devRole);

      try {
        const ev = await gqlRequest<{ createEvidenceManifest: { id: string } }>(
          `mutation($issue: ID!, $stmt: String!) { createEvidenceManifest(issueId: $issue, statement: $stmt) { id } }`,
          { issue: issueId, stmt: "Sản phẩm không đạt tiêu chuẩn yêu cầu trong mô tả." },
          { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
        );
        const raise = await gqlRequest<{ prepareRaiseDispute: PreparedCall }>(
          `mutation($issue: ID!, $man: ID!) { prepareRaiseDispute(issueId: $issue, manifestId: $man) { intentId contractAddress data value } }`,
          { issue: issueId, man: ev.createEvidenceManifest.id },
          { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
        );
        await executePreparedCalls(clientSession.wallet, [raise.prepareRaiseDispute], clientSession, `Raise dispute ${issueKey}`, this.options.baseUrl);
        await sleep(2000);
        disputes++;

        const cEv = await gqlRequest<{ createEvidenceManifest: { id: string } }>(
          `mutation($issue: ID!, $stmt: String!) { createEvidenceManifest(issueId: $issue, statement: $stmt) { id } }`,
          { issue: issueId, stmt: "Đã hoàn thành đúng yêu cầu và test đầy đủ." },
          { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
        );
        const cRes = await gqlRequest<{ prepareSubmitCounterpartyEvidence: PreparedCall }>(
          `mutation($issue: ID!, $man: ID!) { prepareSubmitCounterpartyEvidence(issueId: $issue, manifestId: $man) { intentId contractAddress data value } }`,
          { issue: issueId, man: cEv.createEvidenceManifest.id },
          { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
        );
        await executePreparedCalls(devSession.wallet, [cRes.prepareSubmitCounterpartyEvidence], devSession, `Counter evidence ${issueKey}`, this.options.baseUrl);
        await sleep(2000);
      } catch (err) {
        console.warn(`Dispute prep failed for ${issueKey}:`, err);
      }
    }

    // Advance EVM time past 72h evidence window to post Initial Rulings
    const isLocal = (process.env.CHAIN_ID || "31337") === "31337";
    if (isLocal) {
      const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
      console.log("Advancing EVM time by 73 hours for Initial Rulings...");
      await provider.send("evm_increaseTime", [73 * 3600]);
      await provider.send("evm_mine", []);
      await sleep(1000);

      const adminSession = await this.getSession("admin");
      const arbSigner = adminSession.wallet.provider ? adminSession.wallet : adminSession.wallet.connect(provider);

      // Post initial rulings for all 6 issues (initRulingStart..finalRulingEnd)
      for (let i = initRulingStart; i <= finalRulingEnd; i++) {
        const issueKey = `issue_${String(i).padStart(3, "0")}`;
        const issueId = this.state.issues[issueKey];
        if (!issueId) continue;

        try {
          const draftInit = await gqlRequest<{ draftRuling: { decisionHash: string; safeTransactionJson: string } }>(
            `mutation($id: ID!, $kind: RulingDraftKind!, $bps: Int!, $rat: String!) {
              draftRuling(issueId: $id, kind: $kind, clientBps: $bps, rationale: $rat) { decisionHash safeTransactionJson }
            }`,
            { id: issueId, kind: "INITIAL", bps: 3000, rat: "Bằng chứng phản ánh đúng một phần thực tế của dự án." },
            { cookie: adminSession.cookie, ip: adminSession.ip, baseUrl: this.options.baseUrl }
          );
          const safeTxInit = JSON.parse(draftInit.draftRuling.safeTransactionJson).transactions[0];
          const arbTx1 = await arbSigner.sendTransaction({ to: safeTxInit.to, data: safeTxInit.data, gasLimit: 500000 });
          await arbTx1.wait(1);
          await sleep(2000);
        } catch (err) {
          console.warn(`Initial ruling failed for ${issueKey}:`, err);
        }
      }

      // For finalRulingStart..finalRulingEnd, challenge ruling and draft final ruling
      for (let i = finalRulingStart; i <= finalRulingEnd; i++) {
        const issueKey = `issue_${String(i).padStart(3, "0")}`;
        const issueId = this.state.issues[issueKey];
        if (!issueId) continue;

        const clientRole = this.state.issueMetadata[issueKey]?.clientRole || (isHardhat ? "hh04" : "user01");
        const clientSession = await this.getSession(clientRole);

        try {
          const chal = await gqlRequest<{ prepareChallengeRuling: PreparedCall }>(
            `mutation($id: ID!) { prepareChallengeRuling(issueId: $id) { intentId contractAddress data value } }`,
            { id: issueId },
            { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
          );
          await executePreparedCalls(clientSession.wallet, [chal.prepareChallengeRuling], clientSession, `Challenge ruling ${issueKey}`, this.options.baseUrl);
          await sleep(2000);

          const draftFinal = await gqlRequest<{ draftRuling: { decisionHash: string; safeTransactionJson: string } }>(
            `mutation($id: ID!, $kind: RulingDraftKind!, $bps: Int!, $rat: String!) {
              draftRuling(issueId: $id, kind: $kind, clientBps: $bps, rationale: $rat) { decisionHash safeTransactionJson }
            }`,
            { id: issueId, kind: "FINAL", bps: 6000, rat: "Phán quyết cuối cùng phân chia 60% client và 40% dev." },
            { cookie: adminSession.cookie, ip: adminSession.ip, baseUrl: this.options.baseUrl }
          );
          const safeTxFinal = JSON.parse(draftFinal.draftRuling.safeTransactionJson).transactions[0];
          const arbTx2 = await arbSigner.sendTransaction({ to: safeTxFinal.to, data: safeTxFinal.data, gasLimit: 500000 });
          await arbTx2.wait(1);
          await sleep(2000);
        } catch (err) {
          console.warn(`Challenge/Final ruling failed for ${issueKey}:`, err);
        }
      }

      // Advance EVM time past 24h challenge cooling-off window to finalize rulings
      console.log("Advancing EVM time by 25 hours to finalize rulings...");
      await provider.send("evm_increaseTime", [25 * 3600]);
      await provider.send("evm_mine", []);
      await sleep(1000);

      for (let i = finalRulingStart; i <= finalRulingEnd; i++) {
        const issueKey = `issue_${String(i).padStart(3, "0")}`;
        const issueId = this.state.issues[issueKey];
        if (!issueId) continue;

        try {
          const fin = await gqlRequest<{ prepareFinalizeRuling: PreparedCall }>(
            `mutation($id: ID!) { prepareFinalizeRuling(issueId: $id) { intentId contractAddress data value } }`,
            { id: issueId },
            { cookie: adminSession.cookie, ip: adminSession.ip, baseUrl: this.options.baseUrl }
          );
          await executePreparedCalls(adminSession.wallet, [fin.prepareFinalizeRuling], adminSession, `Finalize ruling ${issueKey}`, this.options.baseUrl);
          await sleep(2000);
        } catch (err) {
          console.warn(`Finalize ruling failed for ${issueKey}:`, err);
        }
      }

      // Missed delivery refund (issues missedDeliveryStart..missedDeliveryEnd)
      console.log("Advancing EVM time by 25 hours for missed-delivery refund...");
      await provider.send("evm_increaseTime", [25 * 3600]);
      await provider.send("evm_mine", []);
      await sleep(1000);

      for (let i = missedDeliveryStart; i <= missedDeliveryEnd; i++) {
        const issueKey = `issue_${String(i).padStart(3, "0")}`;
        const issueId = this.state.issues[issueKey];
        if (!issueId) continue;

        const clientRole = this.state.issueMetadata[issueKey]?.clientRole || (isHardhat ? "hh04" : "user01");
        const clientSession = await this.getSession(clientRole);

        try {
          const refRes = await gqlRequest<{ prepareClaimMissedDeliveryRefund: PreparedCall }>(
            `mutation($id: ID!) { prepareClaimMissedDeliveryRefund(issueId: $id) { intentId contractAddress data value } }`,
            { id: issueId },
            { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
          );
          await executePreparedCalls(
            clientSession.wallet,
            [refRes.prepareClaimMissedDeliveryRefund],
            clientSession,
            `Claim missed-delivery refund ${issueKey}`,
            this.options.baseUrl
          );
          await sleep(2000);
        } catch (err) {
          console.warn(`Missed delivery refund failed for ${issueKey}:`, err);
        }
      }

      // Review timeout (issues reviewTimeoutStart..reviewTimeoutEnd)
      console.log("Advancing EVM time by 170 hours for review timeout...");
      await provider.send("evm_increaseTime", [170 * 3600]);
      await provider.send("evm_mine", []);
      await sleep(1000);

      for (let i = reviewTimeoutStart; i <= reviewTimeoutEnd; i++) {
        const issueKey = `issue_${String(i).padStart(3, "0")}`;
        const issueId = this.state.issues[issueKey];
        if (!issueId) continue;

        const devRole = this.state.reservations[issueKey]?.developerRole || (isHardhat ? "hh11" : "user11");
        const devSession = await this.getSession(devRole);

        try {
          const toRes = await gqlRequest<{ prepareClaimReviewTimeout: PreparedCall }>(
            `mutation($id: ID!) { prepareClaimReviewTimeout(issueId: $id) { intentId contractAddress data value } }`,
            { id: issueId },
            { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
          );
          await executePreparedCalls(
            devSession.wallet,
            [toRes.prepareClaimReviewTimeout],
            devSession,
            `Claim review timeout ${issueKey}`,
            this.options.baseUrl
          );
          await sleep(2000);
        } catch (err) {
          console.warn(`Review timeout claim failed for ${issueKey}:`, err);
        }
      }
    }

    return { releases, settlements, disputes };
  }

  // WAVE 9: Reviews for completed tasks & Admin moderation (hide & ban)
  public async runWave9(): Promise<{ reviewsCount: number; spamIssuesHidden: number; bannedSpammer: boolean }> {
    const isHardhat = isHardhatMode();
    const completedIndices = isHardhat
      ? [
          ...Array.from({ length: 25 }, (_, i) => i + 1), // 1..25 releases
          ...Array.from({ length: 6 }, (_, i) => i + 26), // 26..31 settlements
          ...Array.from({ length: 3 }, (_, i) => i + 39), // 39..41 finalized rulings
        ]
      : Array.from({ length: 14 }, (_, i) => i + 1);

    console.log(`=== Wave 9: Reviews (${completedIndices.length} completed tasks) & Admin Moderation ===`);
    let reviewsCount = 0;
    let spamIssuesHidden = 0;
    let bannedSpammer = false;

    if (this.options.dryRun) {
      return { reviewsCount: completedIndices.length, spamIssuesHidden: 2, bannedSpammer: true };
    }

    // Submit reviews for completed tasks
    for (const i of completedIndices) {
      const issueKey = `issue_${String(i).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId) continue;

      const clientRole = this.state.issueMetadata[issueKey]?.clientRole || (isHardhat ? "hh04" : "user01");
      const clientSession = await this.getSession(clientRole);

      try {
        const rating = 4 + (i % 2); // 4 or 5 stars
        const reviewComments = [
          "Developer làm việc rất chuyên nghiệp, code sạch và bàn giao đúng thời hạn. Rất hài lòng!",
          "Chất lượng giải pháp xuất sắc, phản hồi nhanh chóng và hỗ trợ rất nhiệt tình.",
          "Giao hàng đúng tiến độ, viết unit test đầy đủ và tài liệu kiến trúc rõ ràng.",
          "Kỹ sư xử lý bài toán hiệu quả, giao tiếp chuẩn mực và nghiệm thu rất thuận lợi.",
        ];
        const comment = reviewComments[i % reviewComments.length];
        await gqlRequest(
          `mutation Rev($issueId: ID!, $rating: Int!, $comment: String) {
            submitReview(issueId: $issueId, rating: $rating, comment: $comment) {
              id
            }
          }`,
          {
            issueId,
            rating,
            comment,
          },
          { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
        );
        reviewsCount++;
      } catch (err: any) {
        if (err?.message?.includes("Bài toán đã có đánh giá")) {
          reviewsCount++;
        } else {
          console.warn(`Review skipped for ${issueKey}:`, err);
        }
      }
    }

    // Spammer posts 2 spam issues
    try {
      const spamSession = await this.getSession("spammer");
      const adminSession = await this.getSession("admin");
      const tokenId = await this.ensureTargetTokenId();

      for (let s = 1; s <= 2; s++) {
        const spamRes = await gqlRequest<{ createIssue: { id: string } }>(
          `mutation SpamIssue($input: CreateIssueInput!) {
            createIssue(input: $input) {
              id
            }
          }`,
          {
            input: {
              title: `Free Crypto Giveaway Click Link Here Spam #${s}`,
              description: "Promotional spam advertisement content violating terms of service. Free tokens giveaway.",
              category: "OTHER",
              bountyAmount: "0.5",
              tokenId,
            },
          },
          { cookie: spamSession.cookie, ip: spamSession.ip, baseUrl: this.options.baseUrl }
        );

        const spamId = spamRes.createIssue.id;

        // Admin hides the spam issue
        await gqlRequest(
          `mutation Hide($issueId: ID!, $reason: String!) {
            adminHideIssue(issueId: $issueId, reason: $reason)
          }`,
          { issueId: spamId, reason: "Phát hiện nội dung quảng cáo spam độc hại" },
          { cookie: adminSession.cookie, ip: adminSession.ip, baseUrl: this.options.baseUrl }
        );
        spamIssuesHidden++;
      }

      // Admin bans the spammer user
      const spamUser = await gqlRequest<{ me: { id: string } }>(
        `query {
          me {
            id
          }
        }`,
        {},
        { cookie: spamSession.cookie, ip: spamSession.ip, baseUrl: this.options.baseUrl }
      );

      if (spamUser.me?.id) {
        await gqlRequest(
          `mutation Ban($input: BanUserInput!) {
            banUser(input: $input) {
              id
              isBanned
            }
          }`,
          {
            input: {
              userId: spamUser.me.id,
              reason: "Tài khoản liên tục đăng tin quảng cáo spam lừa đảo",
            },
          },
          { cookie: adminSession.cookie, ip: adminSession.ip, baseUrl: this.options.baseUrl }
        );
        bannedSpammer = true;
      }
    } catch (err) {
      console.warn("Spam moderation workflow error:", err);
    }

    return { reviewsCount, spamIssuesHidden, bannedSpammer };
  }
}

// CLI handler
if ((import.meta as unknown as { main?: boolean }).main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const waveArg = args.find((a, i) => args[i - 1] === "--wave" || a.startsWith("--wave="));
  const wave = waveArg ? waveArg.replace("--wave=", "") : undefined;

  const populator = new DemoPopulator({ dryRun });
  console.log(`=== Demo Populator Started (dryRun=${dryRun}, wave=${wave || "ALL"}) ===`);

  async function run() {
    if (!wave || wave === "W1") await populator.runWave1();
    if (!wave || wave === "W2") await populator.runWave2();
    if (!wave || wave === "W3") await populator.runWave3();
    if (!wave || wave === "W4") await populator.runWave4();
    if (!wave || wave === "W5") await populator.runWave5();
    if (!wave || wave === "W6") await populator.runWave6();
    if (!wave || wave === "W7") await populator.runWave7();
    if (!wave || wave === "W8") await populator.runWave8();
    if (!wave || wave === "W9") await populator.runWave9();
    console.log("=== Demo Populator Finished ===");
  }

  run().catch((err) => {
    console.error("Populator fatal error:", err);
    process.exit(1);
  });
}
