---
title: "04 · Domain Selection"
description: "How to pick the right problem domain for a vertical agent, and why security review scores 5/5"
---

# 04 · Domain Selection

::: info Learning Goals
Apply a five-criterion framework to evaluate any problem domain for agent suitability. Understand why security code review is an ideal first vertical agent.
:::

## The Five-Criterion Framework

Not every problem is a good fit for an autonomous agent. Use this scoring rubric before committing to a domain:

| Criterion | Question | Weight |
|-----------|----------|--------|
| **Tool-amenable** | Can the task be broken into discrete, safe tool calls? | High |
| **Verifiable output** | Is correctness checkable without running the result? | High |
| **Bounded scope** | Can you define "done" without ambiguity? | High |
| **Useful incrementally** | Does partial completion still deliver value? | Medium |
| **API-accessible** | Does the domain require only read access to data? | Medium |

## Evaluating Security Code Review

| Criterion | Assessment | Score |
|-----------|-----------|-------|
| Tool-amenable | `list_directory`, `read_file`, `grep_pattern`, `write_report` — all discrete and safe | ✅ 5/5 |
| Verifiable output | Findings cite file + line + code snippet — independently verifiable | ✅ 5/5 |
| Bounded scope | Done = `write_report` called with OWASP categorized findings | ✅ 5/5 |
| Useful incrementally | Each file read yields potential findings even if scan is aborted early | ✅ 4/5 |
| API-accessible | Read-only — never modifies the codebase | ✅ 5/5 |

**Total: 24/25** — an excellent fit.

## Why Not Other Domains?

::: details Code generation (score: 3/5)
Code generation fails "verifiable output" — you cannot verify correctness without executing the code. It also fails "bounded scope" — "generate a REST API" has no clear stopping condition.
:::

::: details Data analysis (score: 3/5)
Data analysis is tool-amenable and incrementally useful, but the output (charts, summaries) is hard to verify automatically, and large datasets require careful token management.
:::

::: details Infrastructure automation (score: 2/5)
Infrastructure changes are not API-accessible (they require write access), not safe for automatic tool execution (destructive operations), and very hard to bound.
:::

## The sec-review Decision

`sec-review` targets the OWASP Top 10 — the industry-standard taxonomy for web application security vulnerabilities. This gives us:

1. **A complete, stable scope**: 10 categories, well-defined, with concrete examples
2. **A structured output format**: JSON report with OWASP ID, severity, file, line, snippet
3. **A clear stop signal**: `write_report` is called exactly once, then the agent stops
4. **Measurable quality**: We can test against known-vulnerable code fixtures

## OWASP Scope for sec-review

We focus on the five categories most frequently found in code review:

| OWASP ID | Category | What to look for |
|----------|----------|-----------------|
| A01:2021 | Broken Access Control | Missing auth checks, IDOR patterns |
| A02:2021 | Cryptographic Failures | Hardcoded secrets, weak algorithms |
| A03:2021 | Injection | SQL, command, LDAP injection |
| A05:2021 | Security Misconfiguration | Debug flags, permissive CORS |
| A07:2021 | Identification & Auth Failures | Weak password policy, session issues |

The other five (A04 Insecure Design, A06 Vulnerable Components, A08 Software Integrity, A09 Logging Failures, A10 SSRF) are harder to detect from static analysis alone and are left to a future version.

## What We Are NOT Building

::: warning Out of scope
- Dynamic analysis (actually running the code)
- Dependency vulnerability scanning (use `npm audit` for that)
- Secret detection (use a dedicated scanner like `gitleaks`)
- Auto-fix / patch generation (write operations violate the read-only invariant)
:::

Staying in scope keeps the agent reliable. The moment the agent starts writing files, verifying its output becomes dramatically harder.

**Next:** [05 · Agent Specification →](/guide/05-agent-specification)
