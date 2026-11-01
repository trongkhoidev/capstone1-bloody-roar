// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Đối chiếu với packages/shared/src/escrow/hashing.test.ts: cùng chuỗi JCS (RFC 8785), cùng keccak256.
contract HashVectorsTest {
    function testKeccakStandardVector() public pure {
        assertHash("", bytes32(0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470));
    }

    function testTermsHashVector() public pure {
        assertHash(
            '{"acceptanceCriteria":[{"id":"c1","text":"A"},{"id":"c2","text":"B"}],"amountRaw":"1250000000","category":"BUG_FIX","deliveryDeadline":"1791828000","descriptionSha256":"0000000000000000000000000000000000000000000000000000000000000000","githubRepo":"bloody-roar/capstone1","issueId":"issue-1","termsVersion":1,"title":"Fix login","token":"0x036CbD53842c5426634e7929541eC2318f3dCF7e"}',
            bytes32(0x63710365bb46fd288f7df1eb11c385952b61aca9372367c618bcd66e892af6c3)
        );
    }

    function testDeliveryHashVector() public pure {
        assertHash(
            '{"attachments":[{"key":"delivery/a.png","mime":"image/png","sha256":"1111111111111111111111111111111111111111111111111111111111111111","size":2048}],"commitSha":"abcdef1","descriptionSha256":"0000000000000000000000000000000000000000000000000000000000000000","issueId":"issue-1","prUrl":"https://github.com/bloody-roar/capstone1/pull/7","submissionId":"sub-1"}',
            bytes32(0x1a7bd1d14d6b65e4078ee767b77590e7821a634a4896bc3b1add426d0f337b8f)
        );
    }

    function testEvidenceHashVector() public pure {
        assertHash(
            '{"chatRange":{"fromMessageId":"m1","toMessageId":"m9","transcriptSha256":"4444444444444444444444444444444444444444444444444444444444444444"},"escrowId":"issue-1","files":[{"key":"evidence/x.pdf","mime":"application/pdf","name":"x.pdf","sha256":"3333333333333333333333333333333333333333333333333333333333333333","size":1000}],"side":"CLIENT","statement":{"sha256":"2222222222222222222222222222222222222222222222222222222222222222","text":"Late delivery"}}',
            bytes32(0x0f8546fe6034e16b1b75c4460f305b0d20cabeaf896a5510205d8c32ca101f60)
        );
    }

    function testEvidenceHashVectorWithoutChatRange() public pure {
        assertHash(
            '{"chatRange":null,"escrowId":"issue-1","files":[{"key":"evidence/x.pdf","mime":"application/pdf","name":"x.pdf","sha256":"3333333333333333333333333333333333333333333333333333333333333333","size":1000}],"side":"CLIENT","statement":{"sha256":"2222222222222222222222222222222222222222222222222222222222222222","text":"Late delivery"}}',
            bytes32(0xf0077ee4bc29301de477bec4660a1508755dbe01d10b5e60e334c90d98d9002f)
        );
    }

    function testDecisionHashVector() public pure {
        assertHash(
            '{"clientBps":5000,"escrowId":"issue-1","issueId":"issue-1","rationale":"Split evenly"}',
            bytes32(0x175f418b072513d49316abdd3c7032d9941b8934ac69f8b1fdf19a650419c041)
        );
    }

    function assertHash(string memory json, bytes32 expected) internal pure {
        require(keccak256(bytes(json)) == expected, "hash vector mismatch");
    }
}
