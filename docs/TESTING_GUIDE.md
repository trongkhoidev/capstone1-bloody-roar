# Hướng Dẫn Test GraphQL API (Đầy đủ tất cả Modules)

Dưới đây là tổng hợp tất cả các queries và mutations hiện có của hệ thống (User, Issue, Application, Chat) để bạn có thể tự kiểm tra trên GraphiQL (`http://localhost:3000/api/graphql`).

> **Lưu ý quan trọng về Xác Thực (Authentication):**
> Đa số các thao tác cần phải đăng nhập (có `ctx.user`). Trong quá trình test, nếu chưa có hệ thống đăng nhập Frontend, bạn cần tạm thời tắt (comment) hàm `requireAuth` ở đầu mỗi module tương ứng và gán cứng một user ảo.
> Ví dụ: `const user = { id: "user_123", role: "CLIENT" };` (nhớ đổi role thành `DEVELOPER` khi test ứng tuyển).

---

## Phần 1: Module User (Người dùng)

*(Lưu ý: Schema `User` hiện không có trường `email`, tôi đã bỏ nó ra khỏi câu lệnh dưới đây để tránh lỗi)*

### 1.1 Lấy thông tin cá nhân (`me`)
```graphql
query GetMyProfile {
  me {
    id
    walletAddress
    role
    name
    bio
    skills
    reputationScore
    completedTaskCount
  }
}
```

### 1.2 Lấy thông tin một user bất kỳ (`user`)
```graphql
query GetUserProfile {
  user(id: "ĐIỀN_USER_ID_VÀO_ĐÂY") {
    id
    name
    bio
    reputationScore
  }
}
```

### 1.3 Cập nhật hồ sơ (`updateProfile`)
```graphql
mutation UpdateMyProfile {
  updateProfile(
    input: {
      name: "Tên Mới Của Tôi"
      bio: "Tôi là một Web3 Developer đam mê code."
    }
  ) {
    id
    name
    bio
  }
}
```

---

## Phần 2: Module Issue (Bounty / Nhiệm vụ)

### 2.1 Đăng Task mới (`createIssue`)
*(Yêu cầu role: CLIENT)*
```graphql
mutation CreateNewTask {
  createIssue(
    input: {
      title: "Cần fix bug Smart Contract"
      description: "Tôi có một lỗi reentrancy ở file Token.sol, cần cao thủ giúp!"
      category: SMART_CONTRACT
      bountyAmount: 500
      tokenId: "token_id_abc123" 
      requiredSkills: ["Solidity", "Hardhat", "Security"]
      difficulty: "Hard"
      timeEstimate: "3 days"
    }
  ) {
    id
    title
    status
    category
    createdAt
  }
}
```

### 2.2 Xem chi tiết 1 Task (`issue`)
```graphql
query GetIssueDetail {
  issue(id: "ĐIỀN_ID_ISSUE_VÀO_ĐÂY") {
    id
    title
    description
    requiredSkills
    status
    bountyAmount
    client {
      id
      name
    }
  }
}
```

### 2.3 Xem danh sách Task (`issues`)
```graphql
query FilterIssues {
  issues(
    first: 10
    search: "bug"
    category: SMART_CONTRACT
    bountyMin: 100
    bountyMax: 1000
    status: OPEN
  ) {
    edges {
      node {
        id
        title
        bountyAmount
        category
        status
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### 2.4 Cập nhật Task (`updateIssue`)
*(Chỉ Chủ Task mới thực hiện được)*
```graphql
mutation UpdateMyTask {
  updateIssue(
    input: {
      id: "ĐIỀN_ID_ISSUE_VÀO_ĐÂY"
      title: "Đã sửa tiêu đề: Cần fix bug Smart Contract gấp!"
      bountyAmount: 800
    }
  ) {
    id
    title
    bountyAmount
  }
}
```

### 2.5 Hủy Task (`cancelIssue`)
*(Chỉ Chủ Task mới thực hiện được và khi Task đang ở trạng thái OPEN)*
```graphql
mutation CancelMyTask {
  cancelIssue(id: "ĐIỀN_ID_ISSUE_VÀO_ĐÂY") {
    id
    title
    status
  }
}
```

---

## Phần 3: Module Application (Ứng tuyển)

### 3.1 Nộp đơn ứng tuyển (`createApplication`)
*(Yêu cầu role: DEVELOPER)*
```graphql
mutation ApplyForTask {
  createApplication(
    input: {
      issueId: "ĐIỀN_ID_ISSUE_ĐANG_OPEN_VÀO_ĐÂY"
      message: "Tôi có 5 năm kinh nghiệm Solidity, có thể fix trong 1 ngày!"
    }
  ) {
    id
    status
    message
    createdAt
  }
}
```

### 3.2 Lấy danh sách ứng tuyển của mình (`myApplications`)
*(Dành cho Developer để xem mình đã nộp những đơn nào)*
```graphql
query GetMyApplications {
  myApplications {
    id
    status
    message
    issue {
      id
      title
      status
    }
  }
}
```

### 3.3 Xem danh sách đơn ứng tuyển của một Task (`applications`)
*(Dành cho Client xem có ai nộp đơn vào Task của mình)*
```graphql
query ViewApplicants {
  applications(issueId: "ĐIỀN_ID_ISSUE_CỦA_CLIENT") {
    id
    status
    message
    developer {
      id
      name
    }
  }
}
```

### 3.4 Chấp nhận ứng viên (`acceptApplication`)
*(Dành cho Client)*
```graphql
mutation AcceptDev {
  acceptApplication(applicationId: "ĐIỀN_ID_CỦA_APPLICATION_VÀO_ĐÂY") {
    id
    status
    issue {
      status
      developer {
        id
      }
    }
  }
}
```
*(Kết quả: Application thành `ACCEPTED`, Issue thành `IN_PROGRESS`, các Application khác bị `REJECTED`)*

### 3.5 Từ chối ứng viên (`rejectApplication`)
*(Dành cho Client)*
```graphql
mutation RejectDev {
  rejectApplication(applicationId: "ĐIỀN_ID_CỦA_APPLICATION_VÀO_ĐÂY") {
    id
    status
  }
}
```

---

## Phần 4: Module Chat (Tin nhắn)

### 4.1 Lấy danh sách tin nhắn của một Task (`messages`)
*(Yêu cầu user gọi lệnh này phải là Client hoặc Developer được phân công cho Task đó)*
```graphql
query GetChatMessages {
  messages(issueId: "ĐIỀN_ID_ISSUE_VÀO_ĐÂY", first: 50) {
    edges {
      node {
        id
        content
        type
        createdAt
        sender {
          id
          name
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```
