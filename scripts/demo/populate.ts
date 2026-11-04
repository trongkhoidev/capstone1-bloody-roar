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
import { KEYS_PATH, loadOrCreateWallets, type WalletStore } from "./wallets";
import {
  CONTENT_DIR,
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
    this.options = { baseUrl: process.env.BASE_URL || "http://localhost:4001", ...options };
    if (!fs.existsSync(KEYS_PATH)) {
      this.keys = loadOrCreateWallets();
    } else {
      this.keys = JSON.parse(fs.readFileSync(KEYS_PATH, "utf-8")) as WalletStore;
    }
    this.state = loadState();

    this.profiles = JSON.parse(
      fs.readFileSync(path.join(CONTENT_DIR, "profiles.json"), "utf-8")
    ) as ProfileContent[];
    this.issues = JSON.parse(
      fs.readFileSync(path.join(CONTENT_DIR, "issues.json"), "utf-8")
    ) as IssueContent[];
    this.comments = JSON.parse(
      fs.readFileSync(path.join(CONTENT_DIR, "comments.json"), "utf-8")
    ) as CommentContent[];
    this.chatRooms = JSON.parse(
      fs.readFileSync(path.join(CONTENT_DIR, "chat.json"), "utf-8")
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
    purpose: "AVATAR" | "ISSUE_ATTACHMENT" | "DELIVERY" | "EVIDENCE",
    pngBuffer: Buffer,
    filename: string
  ): Promise<string> {
    const baseUrl = this.options.baseUrl || process.env.BASE_URL || "http://localhost:4001";
    const initRes = await fetch(`${baseUrl}/api/uploads`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: session.cookie,
        "x-forwarded-for": session.ip,
      },
      body: JSON.stringify({
        filename,
        mimeType: "image/png",
        sizeBytes: pngBuffer.length,
        purpose,
      }),
    });

    if (!initRes.ok) {
      throw new Error(`Upload init failed: HTTP ${initRes.status}`);
    }

    const { uploadId, uploadUrl } = (await initRes.json()) as {
      uploadId: string;
      uploadUrl: string;
    };

    // Upload the binary payload
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": "image/png" },
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
      body: JSON.stringify({ uploadId }),
    });

    if (!completeRes.ok) {
      throw new Error(`Upload complete failed: HTTP ${completeRes.status}`);
    }

    const completed = (await completeRes.json()) as { fileId?: string; id?: string };
    return completed.fileId || completed.id || uploadId;
  }

  // WAVE 1: Update 40 user profiles and upload avatars
  public async runWave1(): Promise<{ updatedCount: number }> {
    console.log("=== Wave 1: Profiles & Avatars (40 wallets) ===");
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
        const fileId = await this.uploadPng(session, "AVATAR", avatarBuffer, `${p.role}-avatar.png`);
        avatarUrl = `/api/uploads/${fileId}`;
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
          },
        },
        { cookie: session.cookie, ip: session.ip, baseUrl: this.options.baseUrl }
      );

      this.state.profilesUpdated[p.role] = true;
      saveState(this.state);
      count++;
      console.log(`Updated profile for ${p.role}: ${p.name} (${count}/40)`);
    }

    return { updatedCount: count };
  }

  private async ensureTargetTokenId(): Promise<string> {
    if (this.token84532Id) return this.token84532Id;
    const targetChainId = Number(process.env.CHAIN_ID || 84532);
    const session = await this.getSession("user01");
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

  // WAVE 2: Create 150 issues across 9 categories (20% attachments, 40 criteria)
  public async runWave2(): Promise<{ createdIssuesCount: number }> {
    console.log("=== Wave 2: Issues (150 issues across 9 categories) ===");
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
          const fileId = await this.uploadPng(session, "ISSUE_ATTACHMENT", imgBuffer, `${item.key}-preview.png`);
          await gqlRequest(
            `mutation AttachFile($issueId: ID!, $fileId: ID!) {
              attachIssueFile(issueId: $issueId, fileId: $fileId) {
                id
              }
            }`,
            { issueId, fileId },
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
      if (count % 15 === 0) {
        console.log(`Created ${count}/150 issues...`);
      }
    }

    return { createdIssuesCount: count };
  }

  // WAVE 3: Post 500 comments (100 replies) and record views
  public async runWave3(): Promise<{ commentsCount: number }> {
    console.log("=== Wave 3: Comments (500 comments with 100 replies) ===");
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

  // WAVE 4: 350 applications, 15 withdraws, 20 rejects
  public async runWave4(): Promise<{ appliedCount: number; withdrawnCount: number; rejectedCount: number }> {
    console.log("=== Wave 4: Applications (350 applications, 15 withdraws, 20 rejects) ===");
    let applied = 0;
    let withdrawn = 0;
    let rejected = 0;

    const devRoles = Array.from({ length: 22 }, (_, i) => `user${String(i + 11).padStart(2, "0")}`);

    // Generate ~350 applications distributed across issues
    let appIdx = 0;
    for (let i = 1; i <= 150; i++) {
      const issueKey = `issue_${String(i).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId && !this.options.dryRun) continue;

      const metadata = this.state.issueMetadata[issueKey];
      const clientRole = metadata?.clientRole || "user01";

      // 0 to 5 applicants per issue (ensure issues 1..45 have applicants for reservations)
      const numApplicants = i <= 45 ? 1 + (i % 4) : (i % 6);
      for (let a = 0; a < numApplicants; a++) {
        appIdx++;
        const appKey = `app_${String(appIdx).padStart(4, "0")}`;
        const devRole = devRoles[(i + a) % devRoles.length]!;

        if (this.state.applications[appKey] && !this.options.dryRun) {
          applied++;
          continue;
        }

        if (this.options.dryRun) {
          applied++;
          if (appIdx <= 15) withdrawn++;
          if (appIdx > 15 && appIdx <= 35) rejected++;
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

        // 15 withdraws
        if (withdrawn < 15 && appIdx <= 20) {
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

        // 20 rejects by client
        if (rejected < 20 && appIdx > 20 && appIdx <= 45) {
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
      }
    }

    console.log(`Applications completed: ${applied} applied, ${withdrawn} withdrawn, ${rejected} rejected.`);
    return { appliedCount: applied, withdrawnCount: withdrawn, rejectedCount: rejected };
  }

  // WAVE 5: selectDeveloper for 45 issues (35 funded, 4 cancelled, 3 expired)
  public async runWave5(): Promise<{ selectedCount: number; fundedCount: number; cancelledCount: number }> {
    console.log("=== Wave 5: Reservations & Escrow Deposits (45 selected, 35 funded, 4 cancelled) ===");
    let selected = 0;
    let funded = 0;
    let cancelled = 0;

    for (let r = 1; r <= 45; r++) {
      const issueKey = `issue_${String(r).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId && !this.options.dryRun) continue;

      const metadata = this.state.issueMetadata[issueKey];
      const clientRole = metadata?.clientRole || "user01";
      const devRole = `user${String(11 + (r % 22)).padStart(2, "0")}`;

      if (this.options.dryRun) {
        selected++;
        if (r <= 35) funded++;
        if (r > 35 && r <= 39) cancelled++;
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
          for (let d = 11; d <= 32; d++) {
            const candidateRole = `user${String(d).padStart(2, "0")}`;
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

      // 4 cancelled reservations
      if (r > 35 && r <= 39 && resObj.status === "AWAITING_FUNDING") {
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

      // 35 funded on-chain
      if (r <= 35 && resObj.status === "AWAITING_FUNDING") {
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

  // WAVE 6: Task chat in 35 rooms (files, replies, edits, deletes, contact info)
  public async runWave6(): Promise<{ roomsProcessed: number }> {
    console.log("=== Wave 6: Realtime Chat (35 rooms) ===");
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
          await emitAck(senderSocket, "message:send", {
            issueId,
            content: msg.text,
            type: "TEXT",
          });
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

  // WAVE 7: Submissions (28 submitted, 5 requestChanges)
  public async runWave7(): Promise<{ submittedCount: number; revisedCount: number }> {
    console.log("=== Wave 7: Submissions (28 submissions, 5 requestChanges) ===");
    let submitted = 0;
    let revised = 0;

    for (let s = 1; s <= 28; s++) {
      const issueKey = `issue_${String(s).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId && !this.options.dryRun) continue;

      if (this.state.submissions[issueKey]) {
        submitted++;
        if (s <= 5) revised++;
        continue;
      }

      if (this.options.dryRun) {
        submitted++;
        if (s <= 5) revised++;
        continue;
      }

      const resObj = this.state.reservations[issueKey];
      const devRole = resObj?.developerRole || `user${String(11 + (s % 22)).padStart(2, "0")}`;
      const clientRole = this.state.issueMetadata[issueKey]?.clientRole || "user01";

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

        // 5 issues get requestChanges then resubmitted
        if (s <= 5) {
          await sleep(2000);
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

  // WAVE 8: Escrow Outcomes (release >= 16, settlement >= 4, dispute >= 5, missed delivery 2)
  public async runWave8(): Promise<{ releases: number; settlements: number; disputes: number }> {
    console.log("=== Wave 8: Escrow Outcomes (Release >= 16, Settlement >= 4, Dispute >= 5) ===");
    let releases = 0;
    let settlements = 0;
    let disputes = 0;

    for (let i = 1; i <= 35; i++) {
      const issueKey = `issue_${String(i).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId && !this.options.dryRun) continue;

      const clientRole = this.state.issueMetadata[issueKey]?.clientRole || "user01";
      const devRole = this.state.reservations[issueKey]?.developerRole || "user11";

      if (this.options.dryRun) {
        if (i <= 16) releases++;
        else if (i <= 20) settlements++;
        else if (i <= 25) disputes++;
        continue;
      }

      // Release for issues 1..16
      if (i <= 16) {
        const clientSession = await this.getSession(clientRole);
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
        } catch (err) {
          console.warn(`Release on-chain skipped/failed for ${issueKey}:`, err);
        }
      }

      if (i >= 17 && i <= 21) {
        const clientSession = await this.getSession(clientRole);
        const devSession = await this.getSession(devRole);
        try {
          const prop = await gqlRequest<{ prepareProposeSettlement: PreparedCall }>(
            `mutation($id: ID!, $bps: Int!) { prepareProposeSettlement(issueId: $id, clientBps: $bps) { intentId contractAddress data value } }`,
            { id: issueId, bps: 5000 },
            { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
          );
          await executePreparedCalls(clientSession.wallet, [prop.prepareProposeSettlement], clientSession, `Propose settlement ${issueKey}`, this.options.baseUrl);
          await sleep(3500);

          const acc = await gqlRequest<{ prepareAcceptSettlement: PreparedCall }>(
            `mutation($id: ID!) { prepareAcceptSettlement(issueId: $id) { intentId contractAddress data value } }`,
            { id: issueId },
            { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
          );
          await executePreparedCalls(devSession.wallet, [acc.prepareAcceptSettlement], devSession, `Accept settlement ${issueKey}`, this.options.baseUrl);
          settlements++;
        } catch (err) {
          console.warn(`Settlement failed for ${issueKey}:`, err);
        }
      }

      if (i >= 22 && i <= 28) {
        const clientSession = await this.getSession(clientRole);
        const devSession = await this.getSession(devRole);
        const isLocal = (process.env.CHAIN_ID || "31337") === "31337";
        try {
          const ev = await gqlRequest<{ createEvidenceManifest: { id: string } }>(
            `mutation($issue: ID!, $stmt: String!) { createEvidenceManifest(issueId: $issue, statement: $stmt) { id } }`,
            { issue: issueId, stmt: "San pham khong dat tieu chuan yeu cau trong mo ta." },
            { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
          );
          const raise = await gqlRequest<{ prepareRaiseDispute: PreparedCall }>(
            `mutation($issue: ID!, $man: ID!) { prepareRaiseDispute(issueId: $issue, manifestId: $man) { intentId contractAddress data value } }`,
            { issue: issueId, man: ev.createEvidenceManifest.id },
            { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
          );
          await executePreparedCalls(clientSession.wallet, [raise.prepareRaiseDispute], clientSession, `Raise dispute ${issueKey}`, this.options.baseUrl);
          disputes++;
          await sleep(3000);

          if (i >= 24 && isLocal) {
            const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
            const cEv = await gqlRequest<{ createEvidenceManifest: { id: string } }>(
              `mutation($issue: ID!, $stmt: String!) { createEvidenceManifest(issueId: $issue, statement: $stmt) { id } }`,
              { issue: issueId, stmt: "Da hoan thanh dung yeu cau va test day du." },
              { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
            );
            const cRes = await gqlRequest<{ prepareSubmitCounterpartyEvidence: PreparedCall }>(
              `mutation($issue: ID!, $man: ID!) { prepareSubmitCounterpartyEvidence(issueId: $issue, manifestId: $man) { intentId contractAddress data value } }`,
              { issue: issueId, man: cEv.createEvidenceManifest.id },
              { cookie: devSession.cookie, ip: devSession.ip, baseUrl: this.options.baseUrl }
            );
            await executePreparedCalls(devSession.wallet, [cRes.prepareSubmitCounterpartyEvidence], devSession, `Counter evidence ${issueKey}`, this.options.baseUrl);
            await sleep(3000);

            await provider.send("evm_increaseTime", [73 * 3600]);
            await provider.send("evm_mine", []);

            const adminSession = await this.getSession("admin");
            const draftInit = await gqlRequest<{ draftRuling: { decisionHash: string; safeTransactionJson: string } }>(
              `mutation($id: ID!, $kind: RulingDraftKind!, $bps: Int!, $rat: String!) { draftRuling(issueId: $id, kind: $kind, clientBps: $bps, rationale: $rat) { decisionHash safeTransactionJson } }`,
              { id: issueId, kind: "INITIAL", bps: 3000, rat: "Bang chung phan anh dung mot phan thuc te." },
              { cookie: adminSession.cookie, ip: adminSession.ip, baseUrl: this.options.baseUrl }
            );
            const safeTxInit = JSON.parse(draftInit.draftRuling.safeTransactionJson).transactions[0];
            const arbSigner = adminSession.wallet.provider ? adminSession.wallet : adminSession.wallet.connect(provider);
            const arbTx1 = await arbSigner.sendTransaction({ to: safeTxInit.to, data: safeTxInit.data, gasLimit: 500000 });
            await arbTx1.wait(1);
            await sleep(3000);

            if (i >= 26) {
              const chal = await gqlRequest<{ prepareChallengeRuling: PreparedCall }>(
                `mutation($id: ID!) { prepareChallengeRuling(issueId: $id) { intentId contractAddress data value } }`,
                { id: issueId },
                { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
              );
              await executePreparedCalls(clientSession.wallet, [chal.prepareChallengeRuling], clientSession, `Challenge ruling ${issueKey}`, this.options.baseUrl);
              await sleep(3000);

              const draftFinal = await gqlRequest<{ draftRuling: { decisionHash: string; safeTransactionJson: string } }>(
                `mutation($id: ID!, $kind: RulingDraftKind!, $bps: Int!, $rat: String!) { draftRuling(issueId: $id, kind: $kind, clientBps: $bps, rationale: $rat) { decisionHash safeTransactionJson } }`,
                { id: issueId, kind: "FINAL", bps: 6000, rat: "Phan quyet cuoi cung phan chia 60% client 40% dev." },
                { cookie: adminSession.cookie, ip: adminSession.ip, baseUrl: this.options.baseUrl }
              );
              const safeTxFinal = JSON.parse(draftFinal.draftRuling.safeTransactionJson).transactions[0];
              const arbTx2 = await arbSigner.sendTransaction({ to: safeTxFinal.to, data: safeTxFinal.data, gasLimit: 500000 });
              await arbTx2.wait(1);

              await provider.send("evm_increaseTime", [25 * 3600]);
              await provider.send("evm_mine", []);

              const fin = await gqlRequest<{ prepareFinalizeRuling: PreparedCall }>(
                `mutation($id: ID!) { prepareFinalizeRuling(issueId: $id) { intentId contractAddress data value } }`,
                { id: issueId },
                { cookie: adminSession.cookie, ip: adminSession.ip, baseUrl: this.options.baseUrl }
              );
              await executePreparedCalls(adminSession.wallet, [fin.prepareFinalizeRuling], adminSession, `Finalize ruling ${issueKey}`, this.options.baseUrl);
              await sleep(3000);
            }
          }
        } catch (err) {
          console.warn(`Dispute workflow failed for ${issueKey}:`, err);
        }
      }
    }

    return { releases, settlements, disputes };
  }

  // WAVE 9: Reviews >= 14, Spammer 2 issues, Admin moderation (hide & ban)
  public async runWave9(): Promise<{ reviewsCount: number; spamIssuesHidden: number; bannedSpammer: boolean }> {
    console.log("=== Wave 9: Reviews >= 14 & Admin Moderation ===");
    let reviewsCount = 0;
    let spamIssuesHidden = 0;
    let bannedSpammer = false;

    if (this.options.dryRun) {
      return { reviewsCount: 14, spamIssuesHidden: 2, bannedSpammer: true };
    }

    // Submit reviews for issues 1..14
    for (let i = 1; i <= 14; i++) {
      const issueKey = `issue_${String(i).padStart(3, "0")}`;
      const issueId = this.state.issues[issueKey];
      if (!issueId && !this.options.dryRun) continue;

      const clientRole = this.state.issueMetadata[issueKey]?.clientRole || "user01";
      const clientSession = await this.getSession(clientRole);

      try {
        const rating = 4 + (i % 2); // 4 or 5 stars
        await gqlRequest(
          `mutation Rev($issueId: ID!, $rating: Int!, $comment: String) {
            submitReview(issueId: $issueId, rating: $rating, comment: $comment) {
              id
            }
          }`,
          {
            issueId,
            rating,
            comment: "Developer làm việc chuyên nghiệp, code sạch và giao hàng đúng hạn.",
          },
          { cookie: clientSession.cookie, ip: clientSession.ip, baseUrl: this.options.baseUrl }
        );
        reviewsCount++;
      } catch (err) {
        console.warn(`Review skipped for ${issueKey}:`, err);
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
