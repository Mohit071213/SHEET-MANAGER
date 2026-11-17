# Security Specification — CallSheet Manager (Stage 2 Sync)

## 1. Data Invariants

1. **Strict Owner Isolation (PII Protection)**: Customer mobile numbers (`mobileNo`) and serial IDs (`serialId`) are strictly private PII. Every document under `/users/{userId}/...` can ONLY be read, listed, created, updated, or deleted when `request.auth != null`, `request.auth.token.email_verified == true`, `request.auth.uid == userId`, and `ownerId == request.auth.uid`.
2. **Master Gate Integrity**: Subcollections (`workbooks`, `chunks`, `records`, `versions`) require parent document existence and ownership verification.
3. **Immutable Audit & Ownership Fields**: `ownerId`, `workbookId`, and `createdAt` are immutable once created. `createdAt` and `updatedAt` must strictly equal `request.time`.
4. **Optimistic Concurrency & Bounded Arrays**: `WorkbookMaster.columnWidths` is strictly bounded (`<= 10` elements, numeric). `WorkbookMaster.version` is monotonically positive integer (`>= 1`).
5. **No Shadow Fields or Oversized Strings**: Every `create` validates exact `hasAll` + `hasOnly` key sets and `.size()` limits on all strings and document IDs (`isValidId`).

## 2. The "Dirty Dozen" Adversarial Payloads

1. Unauthenticated read of `/users/uid1/workbooks/master/records/rec1` → `PERMISSION_DENIED`
2. Authenticated User B reading User A's `/users/uidA/workbooks/master/records/rec1` → `PERMISSION_DENIED`
3. Unverified email token (`email_verified: false`) attempting create on `/users/uid1` → `PERMISSION_DENIED`
4. Identity spoofing: User A creating `/users/uidA/workbooks/master/records/rec1` with `ownerId: "uidB"` → `PERMISSION_DENIED`
5. Shadow field injection on record creation (`{ ..., isAdmin: true }`) → `PERMISSION_DENIED`
6. Oversized document ID poisoning (`1500`-char `{recordId}`) → `PERMISSION_DENIED`
7. Client-forged `createdAt` timestamp (`new Date('2020-01-01') !== request.time`) → `PERMISSION_DENIED`
8. Invalid status enum (`status: "Deleted"`) → `PERMISSION_DENIED`
9. Missing Master Gate parent: writing chunk/record without parent `/users/{uid}/workbooks/{workbookId}` → `PERMISSION_DENIED`
10. Modifying immutable `ownerId` or `createdAt` during `update` → `PERMISSION_DENIED`
11. Modifying an existing immutable version history entry `/versions/{versionId}` → `PERMISSION_DENIED`
12. Cross-user `list` query scraping `/users/{uidA}/workbooks/master/records` as User B → `PERMISSION_DENIED`
