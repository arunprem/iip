# IIP Master Policy Package
# ─────────────────────────────────────────────────────────────────────────────
# This is the root OPA policy package for the Integrated Intelligence Platform.
# All service-specific policies are subpackages of `iip`.
#
# Policy Evaluation Flow:
#   1. Service receives a request
#   2. Service calls OPA POST /v1/data/iip/allow with input
#   3. OPA evaluates applicable rules and returns { allow: true/false }
#   4. Service enforces the decision
#
# Input schema expected by all IIP policies:
# {
#   "user": {
#     "id": "...",
#     "roles": ["ANALYST", ...],
#     "groups": ["intelligence-wing"],
#     "clearance_level": "CONFIDENTIAL",
#     "jit_elevated": false
#   },
#   "resource": {
#     "type": "case",   # e.g. case, user, role, policy, humint_source
#     "id": "...",
#     "classification": "SECRET",
#     "owner_group": "intelligence-wing"
#   },
#   "action": "READ"   # READ | CREATE | UPDATE | DELETE | EXPORT | SEARCH
# }

package iip

import future.keywords.if
import future.keywords.in

# Default deny — explicit allow required
default allow := false

# ─── Classification Hierarchy ─────────────────────────────────────────────────
classification_order := {
    "UNCLASSIFIED": 0,
    "RESTRICTED": 1,
    "CONFIDENTIAL": 2,
    "SECRET": 3,
    "TOP SECRET": 4,
}

user_clearance_level := classification_order[input.user.clearance_level]
resource_classification := classification_order[input.resource.classification]

# User has sufficient clearance for the resource
has_sufficient_clearance if {
    user_clearance_level >= resource_classification
}

# ─── JIT Elevation Guard ──────────────────────────────────────────────────────
# For SECRET and above, JIT elevation must be active
requires_jit if {
    resource_classification >= classification_order["SECRET"]
}

jit_satisfied if {
    requires_jit
    input.user.jit_elevated == true
}

jit_satisfied if {
    not requires_jit
}

# ─── Role Checks ─────────────────────────────────────────────────────────────
has_role(role) if {
    role in input.user.roles
}

# ─── Core Allow Rules ─────────────────────────────────────────────────────────

# SYSTEM_ADMIN can perform any action on any UNCLASSIFIED/RESTRICTED/CONFIDENTIAL resource
allow if {
    has_role("SYSTEM_ADMIN")
    resource_classification <= classification_order["CONFIDENTIAL"]
}

# ANALYST can READ resources at or below their clearance
allow if {
    has_role("ANALYST")
    input.action == "READ"
    has_sufficient_clearance
    jit_satisfied
}

# ANALYST can CREATE and UPDATE at their own clearance level or below
allow if {
    has_role("ANALYST")
    input.action in {"CREATE", "UPDATE"}
    has_sufficient_clearance
    resource_classification <= classification_order["CONFIDENTIAL"]
    jit_satisfied
}

# SUPERVISOR has read/write on all CONFIDENTIAL and below
allow if {
    has_role("SUPERVISOR")
    input.action in {"READ", "CREATE", "UPDATE"}
    has_sufficient_clearance
    jit_satisfied
}

# IT_ADMIN can manage users and roles but cannot read classified content
allow if {
    has_role("IT_ADMIN")
    input.resource.type in {"user", "role", "group", "policy"}
    input.action in {"READ", "CREATE", "UPDATE", "DELETE"}
}

# ─── Deny Overrides ───────────────────────────────────────────────────────────

# No user can export SECRET or TOP SECRET without JIT elevation
deny_export_without_jit if {
    input.action == "EXPORT"
    resource_classification >= classification_order["SECRET"]
    input.user.jit_elevated == false
}

# IT_ADMIN cannot read classified intelligence data
deny_it_admin_reads_classified if {
    has_role("IT_ADMIN")
    input.resource.type in {"case", "humint_source", "intelligence_report"}
    resource_classification > classification_order["UNCLASSIFIED"]
}
