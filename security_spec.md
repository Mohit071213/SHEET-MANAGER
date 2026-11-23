# Security Specification — CallSheet Manager (Stage 2 Sync)

## 1. Data Invariants

1. **Strict Owner Isolation (PII Protection)**: Customer mobile numbers (`mobileNo`) and serial IDs (`serialId`) are strictly private PII. Every document under `/users/{userId}/...` can ONLY be read, listed, created, updated, or deleted when `request.auth != null`, `request.auth.token.email_verified == true`, `request.auth.uid == userId`, and `ownerId == request.auth.uid`.
2. **Master Gate Integrity**: Subcollections (`workbooks`, `chunks`, `records`, `versions`) require parent document existence and ownership verification.
3. **Immutable Audit & Ownership Fields**: `ownerId`, `workbookId`, and `createdAt` are immutable once created. `createdAt` and `updatedAt` must strictly equal `request.time`.
4. **Optimistic Concurrency & Bounded Arrays**: `WorkbookMaster.columnWidths` is strictly bounded (`<= 10` elements, numeric). `WorkbookMaster.version` is monotonically positive integer (`>= 1`).
5. **No Shadow Fields or Oversized Strings**: Every `create` validates exact `hasAll` + `hasOnly` key sets and `.size()` limits on all strings and document IDs (`isValidId`).
6. **Global Entry Defaults & 7-Day Cleanup Integrity**: `UserWorkspace.globalDefaults` is strictly validated (permitted `defaultCategory` enum, bounded strings for `defaultSubcategory`, `defaultEscalations`, `defaultChannels`, boolean `alwaysApplyCategorySubcategory`). Authenticated owners may delete their own expired (>7 days) records, versions, chunks, and workbooks during automatic retention cleanup.

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

---

# Security Specification — Universal Excel Builder Module

## 1. Isolated Collections & Data Invariants
1. **Strict Owner & Account Isolation**: Builder workbooks (`/users/{userId}/builderWorkbooks/{workbookId}`), rows, rules, and custom templates (`/users/{userId}/builderTemplates/{templateId}`) are strictly scoped to `request.auth != null && request.auth.token.email_verified == true && request.auth.uid == userId && data.ownerId == request.auth.uid`.
2. **Master Gate Integrity**: Subcollections `rows/{rowId}` and `rules/{ruleId}` verify parent `builderWorkbooks/{workbookId}` ownership via `getAfter(...)`.
3. **Bounded Schema & Anti-Shadow Keys**: Exact `hasAll` + `hasOnly` key checks, bounded `columns` array (`<= 60`), bounded `values` map (`<= 60` keys), bounded `assignments` (`<= 30`), and `isValidId` path checks.
4. **Immutable Ownership & Server Timestamps**: `ownerId`, `workbookId`, and `createdAt` remain immutable on updates; `createdAt == request.time` on create and `updatedAt == request.time` on updates.
5. **Client Formula-Injection Defense**: Exported `.xlsx` and `.csv` string cells neutralize leading `=`, `+`, `-`, `@`, `\t`, `\r` payloads safely.

