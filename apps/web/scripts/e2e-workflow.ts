import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import { signLoginPayload } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { io } from "socket.io-client";
import { prisma } from "@bloody-roar/database";
import { getS3Storage, localUploadPath } from "../src/lib/storage";
import "../src/lib/env";

const base = process.env.E2E_BASE_URL || "http://localhost:4000";
const TEST_KEYS = [1, 2, 3, 4].map((value) => `0x${value.toString(16).padStart(64, "0")}`);
const workflowId = `e2e-${Date.now()}`;

type GraphQLError = { message: string; extensions?: { code?: string } };
type GraphQLResponse<T = Record<string, unknown>> = {
  data?: T;
  errors?: GraphQLError[];
};
type MessageHistory = {
  messages: {
    edges: Array<{
      cursor: string;
      node: {
        type: string;
        content: string;
        attachments: Array<{ fileUrl: string }>;
      };
    }>;
    pageInfo: { hasNextPage: boolean; startCursor: string | null };
  };
};

async function gql<T = Record<string, unknown>>(
  query: string,
  cookie?: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLResponse<T>> {
  const response = await fetch(`${base}/api/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
  });
  return response.json() as Promise<GraphQLResponse<T>>;
}

function expectCode(result: GraphQLResponse, code: string) {
  assert.equal(
    result.errors?.[0]?.extensions?.code,
    code,
    `Expected ${code}; got ${JSON.stringify(result.errors ?? result.data)}`,
  );
}

async function login(privateKey: string): Promise<{ cookie: string; address: string }> {
  const wallet = new PrivateKeyWallet(privateKey);
  const address = await wallet.getAddress();
  const nonceResponse = await fetch(
    `${base}/api/auth/nonce?address=${encodeURIComponent(address)}`,
  );
  assert.equal(nonceResponse.status, 200, "Wallet nonce should be issued");
  const payload = await nonceResponse.json();
  const signed = await signLoginPayload({ payload, wallet });
  const loginResponse = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signed),
  });
  assert.equal(loginResponse.status, 200, "Wallet login should succeed");
  const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.match(cookie, /^bloody_token=/, "Login should return the HttpOnly session cookie");
  return { cookie, address: address.toLowerCase() };
}

async function setRole(cookie: string, role: "CLIENT" | "DEVELOPER") {
  const result = await gql<{ updateProfile: { role: string } }>(
    "mutation($input: UpdateProfileInput!) { updateProfile(input: $input) { role } }",
    cookie,
    { input: { role } },
  );
  assert.equal(result.data?.updateProfile.role, role);
}

function connectSocket(cookie: string) {
  return new Promise<ReturnType<typeof io>>((resolve, reject) => {
    const socket = io(base, {
      extraHeaders: { Cookie: cookie },
      transports: ["websocket", "polling"],
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (error) => {
      socket.disconnect();
      reject(error);
    });
  });
}

function socketAck(socket: ReturnType<typeof io>, event: string, ...args: unknown[]) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} acknowledgement timed out`)), 5000);
    socket.emit(event, ...args, (error?: string) => {
      clearTimeout(timer);
      if (error) reject(new Error(error));
      else resolve();
    });
  });
}

async function createIssue(cookie: string, tokenId: string, title: string, expiresAt?: string) {
  const result = await gql<{ createIssue: { id: string; status: string } }>(
    `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id status } }`,
    cookie,
    {
      input: {
        title,
        description: "E2E workflow fixture with enough detail for validation and cleanup.",
        category: "BUG_FIX",
        bountyAmount: 100,
        tokenId,
        requiredSkills: ["TypeScript", "GraphQL"],
        ...(expiresAt ? { expiresAt } : {}),
      },
    },
  );
  assert.ok(
    result.data?.createIssue.id,
    `Bounty creation failed: ${JSON.stringify(result.errors)}`,
  );
  return result.data.createIssue.id;
}

async function apply(cookie: string, issueId: string, message: string) {
  return gql<{ applyToIssue: { id: string; status: string } }>(
    `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`,
    cookie,
    { input: { issueId, message } },
  );
}

async function assign(cookie: string, issueId: string, applicationId: string) {
  return gql<{
    assignDeveloper: { id: string; status: string; developerId: string };
  }>(
    `mutation($input: AssignDeveloperInput!) { assignDeveloper(input: $input) { id status developerId } }`,
    cookie,
    { input: { issueId, applicationId } },
  );
}

async function main() {
  if (
    getS3Storage() ||
    process.env.AI_BASE_URL ||
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY
  ) {
    throw new Error(
      "The backend E2E suite uses local storage and disabled hosted AI; clear S3/AI credentials to avoid external writes or charges.",
    );
  }
  const initialUsers = await Promise.all(
    TEST_KEYS.map(async (privateKey) => {
      const address = (await new PrivateKeyWallet(privateKey).getAddress()).toLowerCase();
      return prisma.user.findUnique({
        where: { walletAddress: address },
        select: { id: true, role: true },
      });
    }),
  );
  const issueIds: string[] = [];
  const cookies: string[] = [];
  const sockets: Array<ReturnType<typeof io>> = [];
  const uploadKeys: string[] = [];

  try {
    const [client, developer, stranger, admin] = await Promise.all([
      login(TEST_KEYS[0]!),
      login(TEST_KEYS[1]!),
      login(TEST_KEYS[2]!),
      login(TEST_KEYS[3]!),
    ]);
    cookies.push(client.cookie, developer.cookie, stranger.cookie, admin.cookie);
    await setRole(client.cookie, "CLIENT");
    await setRole(developer.cookie, "DEVELOPER");
    await setRole(stranger.cookie, "DEVELOPER");
    await prisma.user.update({
      where: { walletAddress: admin.address },
      data: { role: "ADMIN" },
    });

    console.log("1. REST health, nonce validation, and session restore");
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).database, "connected");
    assert.equal((await fetch(`${base}/api/auth/nonce`)).status, 400);
    assert.equal((await fetch(`${base}/api/auth/nonce?address=not-a-wallet`)).status, 400);
    const session = await fetch(`${base}/api/auth/session`, {
      headers: { Cookie: client.cookie },
    });
    assert.equal((await session.json()).user.walletAddress.toLowerCase(), client.address);
    const profile = await gql<{ me: { id: string; walletAddress: string } }>(
      `{ me { id walletAddress } }`,
      client.cookie,
    );
    assert.equal(profile.data?.me.walletAddress.toLowerCase(), client.address);
    const publicProfile = await gql<{
      user: { id: string; walletAddress: string };
    }>(`query($id: ID!) { user(id: $id) { id walletAddress } }`, undefined, {
      id: profile.data!.me.id,
    });
    assert.equal(publicProfile.data?.user.id, profile.data?.me.id);

    console.log("2. Marketplace read/write, token network validation, and comments");
    const tokens = await gql<{
      tokens: Array<{ id: string; symbol: string; chainId: number }>;
    }>(`{ tokens { id symbol chainId } }`, client.cookie);
    const token = tokens.data?.tokens.find((item) => item.symbol === "USDC");
    assert.ok(token, "Active Base Sepolia USDC should be available");
    assert.equal(token.chainId, 84532);
    const title = `E2E workflow ${workflowId} primary bounty`;
    const issueId = await createIssue(client.cookie, token.id, title);
    issueIds.push(issueId);
    const publicIssue = await gql<{
      issue: { id: string; status: string; viewCount: number };
    }>(`query($id: ID!) { issue(id: $id) { id status viewCount } }`, undefined, { id: issueId });
    assert.equal(publicIssue.data?.issue.id, issueId);
    assert.equal(publicIssue.data?.issue.viewCount, 1);
    const search = await gql<{
      issues: { totalCount: number; edges: Array<{ node: { id: string } }> };
    }>(
      `query($search: String!) { issues(search: $search) { totalCount edges { node { id } } } }`,
      undefined,
      { search: workflowId },
    );
    assert.ok(search.data?.issues.edges.some(({ node }) => node.id === issueId));
    assert.ok(
      (
        await gql(
          `{ marketplaceStats { openBounties activeHunters bountyPool { symbol amount } } }`,
        )
      ).data,
    );
    assert.ok((await gql(`{ myIssues { id } }`, client.cookie)).data);
    assert.ok(
      (
        await gql(
          `{ userStats { postedTasks workingTasks completedTasks applications completedPayouts } }`,
          client.cookie,
        )
      ).data,
    );

    const updateEmpty = await gql(
      `mutation($input: UpdateIssueInput!) { updateIssue(input: $input) { id } }`,
      client.cookie,
      { input: { id: issueId } },
    );
    expectCode(updateEmpty, "BAD_USER_INPUT");
    const wrongOwnerUpdate = await gql(
      `mutation($input: UpdateIssueInput!) { updateIssue(input: $input) { id } }`,
      developer.cookie,
      { input: { id: issueId, title: `${title} changed` } },
    );
    expectCode(wrongOwnerUpdate, "FORBIDDEN");
    const updatedIssue = await gql<{ updateIssue: { title: string } }>(
      `mutation($input: UpdateIssueInput!) { updateIssue(input: $input) { title } }`,
      client.cookie,
      { input: { id: issueId, title: `${title} revised` } },
    );
    assert.equal(updatedIssue.data?.updateIssue.title, `${title} revised`);

    const crossChainToken = await prisma.token.create({
      data: {
        symbol: "E2E",
        name: "Temporary unsupported test token",
        address: "0x000000000000000000000000000000000000cafe",
        decimals: 18,
        chainId: 1,
      },
    });
    try {
      const unsupportedToken = await gql(
        `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`,
        client.cookie,
        {
          input: {
            title: `Unsupported ${workflowId}`,
            description: "This test input has sufficient description length.",
            category: "BUG_FIX",
            bountyAmount: 100,
            tokenId: crossChainToken.id,
          },
        },
      );
      expectCode(unsupportedToken, "INVALID_TOKEN");
    } finally {
      await prisma.token.delete({ where: { id: crossChainToken.id } });
    }

    const noAuthComment = await gql(
      `mutation($input: CreateIssueCommentInput!) { createIssueComment(input: $input) { id } }`,
      undefined,
      {
        input: {
          issueId,
          body: "A valid comment without an authenticated session.",
        },
      },
    );
    expectCode(noAuthComment, "UNAUTHORIZED");
    const comment = await gql<{
      createIssueComment: { id: string; body: string };
    }>(
      `mutation($input: CreateIssueCommentInput!) { createIssueComment(input: $input) { id body } }`,
      developer.cookie,
      {
        input: {
          issueId,
          body: "Please confirm the expected validation behaviour.",
        },
      },
    );
    assert.equal(
      comment.data?.createIssueComment.body,
      "Please confirm the expected validation behaviour.",
    );
    const comments = await gql<{ issueComments: Array<{ id: string }> }>(
      `query($issueId: String!) { issueComments(issueId: $issueId) { id } }`,
      undefined,
      { issueId },
    );
    assert.ok(
      comments.data?.issueComments.some((item) => item.id === comment.data?.createIssueComment.id),
    );

    const testCase = await prisma.testCase.create({
      data: {
        title: `Acceptance draft ${workflowId}`,
        description: "A manually seeded acceptance criterion for API verification.",
        given: "A client owns an open bounty.",
        when: "The client reviews the criterion.",
        then: "The approved criterion is visible to the assigned developer.",
        source: "MANUAL",
        issueId,
      },
    });
    const ownerCases = await gql<{
      testCases: Array<{ id: string; isApproved: boolean }>;
    }>(
      `query($issueId: String!) { testCases(issueId: $issueId) { id isApproved } }`,
      client.cookie,
      {
        issueId,
      },
    );
    assert.ok(ownerCases.data?.testCases.some((item) => item.id === testCase.id));
    const hiddenDraft = await gql<{
      testCases: Array<{ id: string }>;
    }>(`query($issueId: String!) { testCases(issueId: $issueId) { id } }`, developer.cookie, {
      issueId,
    });
    assert.equal(
      hiddenDraft.data?.testCases.some((item) => item.id === testCase.id),
      false,
    );
    const updateTestCaseMutation = `mutation($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id title isApproved } }`;
    expectCode(
      await gql(updateTestCaseMutation, developer.cookie, {
        input: { id: testCase.id, isApproved: true },
      }),
      "FORBIDDEN",
    );
    const reviewedTestCase = await gql<{
      updateTestCase: { id: string; title: string; isApproved: boolean };
    }>(updateTestCaseMutation, client.cookie, {
      input: {
        id: testCase.id,
        title: "Approved acceptance criterion",
        isApproved: true,
      },
    });
    assert.equal(reviewedTestCase.data?.updateTestCase.isApproved, true);

    const noAI = await gql(
      `mutation($issueId: String!) { generateTestCases(issueId: $issueId) { id } }`,
      client.cookie,
      { issueId },
    );
    if (!process.env.AI_BASE_URL && !process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY)
      expectCode(noAI, "AI_UNAVAILABLE");

    console.log("3. Applications, withdrawal/reapply, assignment, and notifications");
    const developerApplication = await apply(
      developer.cookie,
      issueId,
      "I can complete this task.",
    );
    const strangerApplication = await apply(
      stranger.cookie,
      issueId,
      "I can also help with this task.",
    );
    assert.equal(developerApplication.data?.applyToIssue.status, "PENDING");
    assert.equal(strangerApplication.data?.applyToIssue.status, "PENDING");
    const applications = await gql<{
      applications: Array<{ id: string; status: string }>;
    }>(
      `query($issueId: String!) { applications(issueId: $issueId) { id status } }`,
      client.cookie,
      { issueId },
    );
    assert.equal(applications.data?.applications.length, 2);
    expectCode(
      await gql(
        `query($issueId: String!) { applications(issueId: $issueId) { id } }`,
        stranger.cookie,
        { issueId },
      ),
      "FORBIDDEN",
    );

    const withdrawn = await gql<{ withdrawApplication: { status: string } }>(
      `mutation($id: ID!) { withdrawApplication(id: $id) { status } }`,
      developer.cookie,
      { id: developerApplication.data!.applyToIssue.id },
    );
    assert.equal(withdrawn.data?.withdrawApplication.status, "WITHDRAWN");
    const reapplied = await apply(
      developer.cookie,
      issueId,
      "Updated application after withdrawal.",
    );
    assert.equal(reapplied.data?.applyToIssue.id, developerApplication.data?.applyToIssue.id);
    const assigned = await assign(
      client.cookie,
      issueId,
      developerApplication.data!.applyToIssue.id,
    );
    assert.equal(assigned.data?.assignDeveloper.status, "IN_PROGRESS");
    expectCode(
      await gql(updateTestCaseMutation, client.cookie, {
        input: { id: testCase.id, title: "This edit is locked after assignment." },
      }),
      "ISSUE_NOT_EDITABLE",
    );
    const finalApplications = await gql<{
      applications: Array<{ id: string; status: string }>;
    }>(
      `query($issueId: String!) { applications(issueId: $issueId) { id status } }`,
      client.cookie,
      { issueId },
    );
    assert.equal(
      finalApplications.data?.applications.find(
        (item) => item.id === developerApplication.data?.applyToIssue.id,
      )?.status,
      "ACCEPTED",
    );
    assert.equal(
      finalApplications.data?.applications.find(
        (item) => item.id === strangerApplication.data?.applyToIssue.id,
      )?.status,
      "REJECTED",
    );
    const notifications = await gql<{
      unreadNotificationCount: number;
      notifications: Array<{ id: string }>;
    }>(`{ unreadNotificationCount notifications(first: 30) { id } }`, developer.cookie);
    assert.ok(notifications.data?.notifications.length);
    if (notifications.data?.notifications[0]) {
      const marked = await gql<{ markNotificationRead: { isRead: boolean } }>(
        `mutation($id: ID!) { markNotificationRead(id: $id) { isRead } }`,
        developer.cookie,
        { id: notifications.data.notifications[0].id },
      );
      assert.equal(marked.data?.markNotificationRead.isRead, true);
    }
    assert.ok((await gql(`mutation { markAllNotificationsRead }`, developer.cookie)).data);

    console.log("4. Private room, realtime, idempotency, upload and file authorization");
    const clientSocket = await connectSocket(client.cookie);
    const developerSocket = await connectSocket(developer.cookie);
    const strangerRoomSocket = await connectSocket(stranger.cookie);
    sockets.push(clientSocket, developerSocket, strangerRoomSocket);
    await socketAck(clientSocket, "task:join", issueId);
    await socketAck(developerSocket, "task:join", issueId);
    await assert.rejects(socketAck(strangerRoomSocket, "task:join", issueId));

    const bytes = new TextEncoder().encode("workflow attachment content");
    const metadata = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: developer.cookie },
      body: JSON.stringify({
        fileName: "workflow.txt",
        fileType: "text/plain",
        fileSize: bytes.byteLength,
      }),
    });
    assert.equal(metadata.status, 200);
    const upload = (await metadata.json()) as {
      uploadUrl: string;
      fileUrl: string;
      key: string;
    };
    uploadKeys.push(upload.key);
    const uploadResponse = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "text/plain", Cookie: developer.cookie },
      body: bytes,
    });
    assert.equal(uploadResponse.status, 200, "Local upload should be stored");
    assert.equal(
      (
        await fetch(`${base}/api/uploads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: "x.txt",
            fileType: "text/plain",
            fileSize: 4,
          }),
        })
      ).status,
      401,
    );

    const textMessageId = `concurrent-${workflowId}`;
    const incoming = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for a realtime chat event")),
        7000,
      );
      clientSocket.on("message:new", (message) => {
        if (message.issueId === issueId && message.content.includes("check the upload")) {
          clearTimeout(timer);
          resolve(message.content);
        }
      });
    });
    const textPayload = {
      content: "Please check the upload at dev@example.com",
      type: "TEXT",
      issueId,
      clientMessageId: textMessageId,
    };
    await Promise.all([
      socketAck(developerSocket, "message:send", textPayload),
      socketAck(developerSocket, "message:send", textPayload),
    ]);
    assert.equal(await incoming, "Please check the upload at [REDACTED]");
    const duplicateMessages = await prisma.message.count({
      where: {
        issueId,
        senderId: (
          await prisma.user.findUniqueOrThrow({
            where: { walletAddress: developer.address },
            select: { id: true },
          })
        ).id,
        clientMessageId: textMessageId,
      },
    });
    assert.equal(duplicateMessages, 1, "Concurrent retries should persist one message");

    const filePayload = {
      content: "Shared a file: workflow.txt",
      type: "FILE",
      issueId,
      clientMessageId: `file-${workflowId}`,
      fileUrl: upload.fileUrl,
      fileName: "workflow.txt",
      fileSize: bytes.byteLength,
      fileMime: "text/plain",
    };
    await socketAck(developerSocket, "message:send", filePayload);
    const messageHistory = await gql<MessageHistory>(
      `query($issueId: String!) { messages(issueId: $issueId, first: 1) { edges { cursor node { type content attachments { fileUrl } } } pageInfo { hasNextPage startCursor } } }`,
      client.cookie,
      { issueId },
    );
    assert.equal(messageHistory.data?.messages.edges[0]?.node.type, "FILE");
    assert.ok(messageHistory.data?.messages.edges[0]?.node.attachments[0]?.fileUrl);
    const downloaded = await fetch(upload.fileUrl, {
      headers: { Cookie: client.cookie },
    });
    assert.equal(downloaded.status, 200);
    assert.equal(
      new TextDecoder().decode(await downloaded.arrayBuffer()),
      "workflow attachment content",
    );
    assert.equal((await fetch(upload.fileUrl)).status, 401);
    assert.equal(
      (await fetch(upload.fileUrl, { headers: { Cookie: stranger.cookie } })).status,
      403,
    );
    const cursorPage = await gql<{
      messages: { edges: Array<{ node: { content: string } }> };
    }>(
      `query($issueId: String!, $after: String) { messages(issueId: $issueId, first: 1, after: $after) { edges { node { content } } } }`,
      client.cookie,
      { issueId, after: messageHistory.data?.messages.pageInfo.startCursor },
    );
    assert.equal(
      cursorPage.data?.messages.edges[0]?.node.content,
      "Please check the upload at [REDACTED]",
    );

    console.log("5. Submission/review cycle and GitHub/AI unavailable paths");
    const noAuthSubmission = await gql(
      `mutation($input: SubmitWorkInput!) { submitWork(input: $input) { id } }`,
      undefined,
      { input: { issueId, description: "Unauthorized submission attempt" } },
    );
    expectCode(noAuthSubmission, "UNAUTHORIZED");
    const firstSubmission = await gql<{
      submitWork: { id: string; status: string };
    }>(
      `mutation($input: SubmitWorkInput!) { submitWork(input: $input) { id status } }`,
      developer.cookie,
      {
        input: {
          issueId,
          description: "First delivery for review.",
          pullRequestUrl: "https://github.com/openai/openai/pull/123456789",
        },
      },
    );
    assert.equal(firstSubmission.data?.submitWork.status, "SUBMITTED");
    const outstandingSubmission = await gql(
      `mutation($input: SubmitWorkInput!) { submitWork(input: $input) { id } }`,
      developer.cookie,
      {
        input: {
          issueId,
          description: "A second delivery while review is pending.",
        },
      },
    );
    expectCode(outstandingSubmission, "SUBMISSION_UNDER_REVIEW");
    const submissions = await gql<{
      submissions: Array<{ id: string; status: string }>;
    }>(`query($issueId: String!) { submissions(issueId: $issueId) { id status } }`, client.cookie, {
      issueId,
    });
    assert.equal(submissions.data?.submissions[0]?.status, "SUBMITTED");
    expectCode(
      await gql(
        `query($issueId: String!) { submissions(issueId: $issueId) { id } }`,
        stranger.cookie,
        { issueId },
      ),
      "FORBIDDEN",
    );
    const rejected = await gql<{
      reviewSubmission: { status: string; reviewNotes: string };
    }>(
      `mutation($input: ReviewSubmissionInput!) { reviewSubmission(input: $input) { status reviewNotes } }`,
      client.cookie,
      {
        input: {
          submissionId: firstSubmission.data!.submitWork.id,
          approved: false,
          notes: "Please clarify the test results.",
        },
      },
    );
    assert.equal(rejected.data?.reviewSubmission.status, "REJECTED");
    const secondSubmission = await gql<{
      submitWork: { id: string; status: string };
    }>(
      `mutation($input: SubmitWorkInput!) { submitWork(input: $input) { id status } }`,
      developer.cookie,
      {
        input: {
          issueId,
          description: "Revised delivery with the requested test results.",
        },
      },
    );
    assert.equal(secondSubmission.data?.submitWork.status, "SUBMITTED");
    const approved = await gql<{ reviewSubmission: { status: string } }>(
      `mutation($input: ReviewSubmissionInput!) { reviewSubmission(input: $input) { status } }`,
      client.cookie,
      {
        input: {
          submissionId: secondSubmission.data!.submitWork.id,
          approved: true,
        },
      },
    );
    assert.equal(approved.data?.reviewSubmission.status, "APPROVED");
    expectCode(
      await gql(
        `mutation($input: SubmitWorkInput!) { submitWork(input: $input) { id } }`,
        developer.cookie,
        {
          input: { issueId, description: "A further delivery after approval." },
        },
      ),
      "SUBMISSION_ALREADY_APPROVED",
    );

    const githubStart = await fetch(`${base}/api/auth/github/start`, {
      method: "POST",
      headers: { Cookie: client.cookie },
    });
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET)
      assert.equal(githubStart.status, 503);
    else {
      assert.equal(githubStart.status, 200);
      assert.match(
        (await githubStart.json()).url,
        /^https:\/\/github\.com\/login\/oauth\/authorize/,
      );
    }
    const githubCallback = await fetch(`${base}/api/auth/github/callback?code=e2e&state=e2e`, {
      redirect: "manual",
    });
    assert.equal(githubCallback.status, 307);
    assert.match(githubCallback.headers.get("location") ?? "", /\/profile\?github=error$/);
    const webhook = await fetch(`${base}/api/webhooks/github`, {
      method: "POST",
      body: "{}",
    });
    if (!process.env.GITHUB_WEBHOOK_SECRET) assert.equal(webhook.status, 503);
    else assert.equal(webhook.status, 401);

    console.log("6. Dispute evidence, admin proposal, challenge, and state guards");
    const disputeIssueId = await createIssue(
      client.cookie,
      token.id,
      `E2E workflow ${workflowId} dispute bounty`,
    );
    issueIds.push(disputeIssueId);
    const disputeApplication = await apply(
      developer.cookie,
      disputeIssueId,
      "I will take the disputed-work test task.",
    );
    const disputeAssignment = await assign(
      client.cookie,
      disputeIssueId,
      disputeApplication.data!.applyToIssue.id,
    );
    assert.equal(disputeAssignment.data?.assignDeveloper.status, "IN_PROGRESS");
    const disputeSubmission = await gql<{
      submitWork: { id: string; status: string };
    }>(
      `mutation($input: SubmitWorkInput!) { submitWork(input: $input) { id status } }`,
      developer.cookie,
      {
        input: {
          issueId: disputeIssueId,
          description: "Evidence submission for the dispute test.",
        },
      },
    );
    const raised = await gql<{ raiseDispute: { id: string; status: string } }>(
      `mutation($input: RaiseDisputeInput!) { raiseDispute(input: $input) { id status } }`,
      developer.cookie,
      {
        input: {
          issueId: disputeIssueId,
          reason: "The agreed delivery was not provided by the deadline.",
        },
      },
    );
    assert.equal(raised.data?.raiseDispute.status, "OPEN");
    expectCode(
      await gql(`query($issueId: String!) { dispute(issueId: $issueId) { id } }`, stranger.cookie, {
        issueId: disputeIssueId,
      }),
      "FORBIDDEN",
    );
    const visibleDispute = await gql<{
      dispute: { id: string; status: string };
    }>(`query($issueId: String!) { dispute(issueId: $issueId) { id status } }`, client.cookie, {
      issueId: disputeIssueId,
    });
    assert.equal(visibleDispute.data?.dispute.id, raised.data?.raiseDispute.id);
    const adminDisputes = await gql<{ adminDisputes: Array<{ id: string }> }>(
      `{ adminDisputes { id } }`,
      admin.cookie,
    );
    assert.ok(
      adminDisputes.data?.adminDisputes.some((item) => item.id === raised.data?.raiseDispute.id),
    );
    expectCode(await gql(`{ adminDisputes { id } }`, developer.cookie), "FORBIDDEN");
    const adminStats = await gql(
      `{ adminStats { users openTasks activeTasks completedTasks openDisputes completedBounties { symbol amount } } }`,
      admin.cookie,
    );
    assert.ok(adminStats.data?.adminStats);
    assert.ok(
      (
        await gql(
          `query($search: String) { adminUsers(search: $search, first: 5) { id role } }`,
          admin.cookie,
          { search: workflowId },
        )
      ).data,
    );

    const messagesOnDispute = await gql(
      `query($issueId: String!) { messages(issueId: $issueId) { edges { node { id } } } }`,
      admin.cookie,
      { issueId: disputeIssueId },
    );
    assert.ok(messagesOnDispute.data?.messages);
    const wrongRoomCursor = await gql(
      `query($issueId: String!, $after: String) { messages(issueId: $issueId, first: 1, after: $after) { edges { node { id } } } }`,
      developer.cookie,
      {
        issueId: disputeIssueId,
        after: messageHistory.data?.messages.pageInfo.startCursor,
      },
    );
    expectCode(wrongRoomCursor, "INVALID_CURSOR");
    expectCode(
      await gql(
        `mutation($input: ReviewSubmissionInput!) { reviewSubmission(input: $input) { id } }`,
        client.cookie,
        {
          input: {
            submissionId: disputeSubmission.data!.submitWork.id,
            approved: true,
          },
        },
      ),
      "ISSUE_NOT_REVIEWABLE",
    );

    const noAIAnalysis = await gql(
      `mutation($issueId: String!) { analyzeDispute(issueId: $issueId) { id status } }`,
      admin.cookie,
      { issueId: disputeIssueId },
    );
    if (!process.env.AI_BASE_URL && !process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY)
      expectCode(noAIAnalysis, "AI_UNAVAILABLE");
    const afterAnalysisFailure = await gql<{ dispute: { status: string } }>(
      `query($issueId: String!) { dispute(issueId: $issueId) { status } }`,
      client.cookie,
      { issueId: disputeIssueId },
    );
    assert.equal(
      afterAnalysisFailure.data?.dispute.status,
      "OPEN",
      "Failed AI analysis should restore the previous dispute state",
    );
    const proposed = await gql<{
      proposeDisputeResolution: { status: string; challengeDeadline: string };
    }>(
      `mutation($input: ProposeDisputeResolutionInput!) { proposeDisputeResolution(input: $input) { status challengeDeadline } }`,
      admin.cookie,
      {
        input: {
          issueId: disputeIssueId,
          clientRatio: 45,
          note: "Refund a portion based on the recorded evidence.",
        },
      },
    );
    assert.equal(proposed.data?.proposeDisputeResolution.status, "PROPOSED");
    assert.ok(Date.parse(proposed.data!.proposeDisputeResolution.challengeDeadline) > Date.now());
    expectCode(
      await gql(
        `mutation($issueId: String!) { challengeDisputeResolution(issueId: $issueId) { status } }`,
        stranger.cookie,
        { issueId: disputeIssueId },
      ),
      "FORBIDDEN",
    );
    const challenged = await gql<{
      challengeDisputeResolution: { status: string };
    }>(
      `mutation($issueId: String!) { challengeDisputeResolution(issueId: $issueId) { status } }`,
      developer.cookie,
      { issueId: disputeIssueId },
    );
    assert.equal(challenged.data?.challengeDisputeResolution.status, "CHALLENGED");

    console.log("7. Expiry, cancellation cleanup, account ban, and optional integrations");
    const expiredIssueId = await createIssue(
      client.cookie,
      token.id,
      `E2E workflow ${workflowId} expired bounty`,
      new Date(Date.now() + 60 * 60_000).toISOString(),
    );
    issueIds.push(expiredIssueId);
    const expiredApplication = await apply(
      developer.cookie,
      expiredIssueId,
      "I applied before this task expired.",
    );
    await prisma.issue.update({
      where: { id: expiredIssueId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expectCode(
      await assign(client.cookie, expiredIssueId, expiredApplication.data!.applyToIssue.id),
      "ISSUE_NOT_OPEN",
    );
    const cancelled = await gql<{ cancelIssue: { status: string } }>(
      `mutation($id: ID!) { cancelIssue(id: $id) { status } }`,
      client.cookie,
      { id: expiredIssueId },
    );
    assert.equal(cancelled.data?.cancelIssue.status, "CANCELLED");
    const cancelledApplications = await gql<{
      myApplications: Array<{ issueId: string; status: string }>;
    }>(`{ myApplications { issueId status } }`, developer.cookie);
    assert.equal(
      cancelledApplications.data?.myApplications.find((item) => item.issueId === expiredIssueId)
        ?.status,
      "REJECTED",
    );
    expectCode(
      await apply(
        developer.cookie,
        expiredIssueId,
        "This should fail because the bounty is closed.",
      ),
      "ISSUE_NOT_OPEN",
    );

    const strangerUser = await prisma.user.findUniqueOrThrow({
      where: { walletAddress: stranger.address },
      select: { id: true },
    });
    const strangerSocket = sockets[2]!;
    const disconnected = new Promise<void>((resolve) =>
      strangerSocket.once("disconnect", () => resolve()),
    );
    const banned = await gql<{ banUser: { id: string; isBanned: boolean } }>(
      `mutation($input: BanUserInput!) { banUser(input: $input) { id isBanned } }`,
      admin.cookie,
      {
        input: {
          userId: strangerUser.id,
          reason: "Automated local workflow ban test.",
        },
      },
    );
    assert.equal(banned.data?.banUser.isBanned, true);
    await Promise.race([
      disconnected,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Banned user's live socket was not disconnected")), 5000),
      ),
    ]);
    assert.equal((await gql<{ me: unknown }>(`{ me { id } }`, stranger.cookie)).data?.me, null);
    const unbanned = await gql<{ unbanUser: { isBanned: boolean } }>(
      `mutation($userId: ID!) { unbanUser(userId: $userId) { isBanned } }`,
      admin.cookie,
      { userId: strangerUser.id },
    );
    assert.equal(unbanned.data?.unbanUser.isBanned, false);
    assert.equal(
      (await gql<{ me: unknown }>(`{ me { id } }`, stranger.cookie)).data?.me,
      null,
      "Ban should revoke the existing session even after unban",
    );
    const logoutResponse = await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: client.cookie },
    });
    assert.equal(logoutResponse.status, 200);
    const clearedSession = await fetch(`${base}/api/auth/session`, {
      headers: { Cookie: client.cookie },
    });
    assert.equal((await clearedSession.json()).user, null);

    const contractAddressConfigured = Boolean(process.env.ESCROW_CONTRACT_ADDRESS_BASE_SEPOLIA);
    if (!contractAddressConfigured)
      console.log(
        "   Contract transaction flow skipped: no deployed escrow address is configured.",
      );
    console.log(
      "   GitHub, S3, and hosted AI endpoints exercised their configured/unconfigured paths without external calls.",
    );
    console.log("✅ Full backend workflow passed.");
  } finally {
    for (const socket of sockets) socket.disconnect();
    for (const issueId of issueIds)
      await prisma.issue.delete({ where: { id: issueId } }).catch(() => undefined);
    for (const key of uploadKeys) {
      const localPath = localUploadPath(key);
      if (localPath) await unlink(localPath.destination).catch(() => undefined);
    }
    for (const cookie of cookies)
      await fetch(`${base}/api/auth/logout`, {
        method: "POST",
        headers: { Cookie: cookie },
      }).catch(() => undefined);
    for (let index = 0; index < TEST_KEYS.length; index++) {
      const address = (await new PrivateKeyWallet(TEST_KEYS[index]!).getAddress()).toLowerCase();
      const existing = initialUsers[index];
      if (existing)
        await prisma.user
          .update({
            where: { walletAddress: address },
            data: { role: existing.role },
          })
          .catch(() => undefined);
      else
        await prisma.user.deleteMany({ where: { walletAddress: address } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("❌ Full backend workflow failed:", error);
  process.exitCode = 1;
});
