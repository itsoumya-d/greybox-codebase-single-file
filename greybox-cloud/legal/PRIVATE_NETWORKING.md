# Greybox Private Networking

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

This is enterprise readiness evidence, not a live cloud-provider console export
or customer network approval.

## Product Control

`GET /v1/enterprise/private-network/readiness` is admin protected by the audit
admin token or WorkOS `audit:read` / `security:read` scopes. It returns AWS VPC
peering and Azure VNet peering profiles with pass/warn/fail checks.

Filter by provider or status:

```bash
curl -sS "https://cloud.greybox.studio/v1/enterprise/private-network/readiness?provider=aws" \
  -H "authorization: Bearer $GREYBOX_AUDIT_ADMIN_TOKEN"
```

The response excludes credentials, customer secrets, provider API keys, route
table bodies, firewall exports, and packet captures.

## AWS VPC Peering Evidence

Set these after the customer accepts the peering request and networking has
validated private-IP reachability:

```bash
export GREYBOX_AWS_VPC_PEERING_ID=pcx-abc123def456
export GREYBOX_AWS_VPC_CUSTOMER_NETWORK_ID=vpc-aaa111bbb222
export GREYBOX_AWS_VPC_GREYBOX_NETWORK_ID=vpc-ccc333ddd444
export GREYBOX_AWS_VPC_CIDR_NON_OVERLAP=true
export GREYBOX_AWS_VPC_ROUTES_UPDATED=true
export GREYBOX_AWS_VPC_SECURITY_RULES_SCOPED=true
export GREYBOX_AWS_VPC_DNS_ENABLED=true
export GREYBOX_AWS_VPC_LAST_VALIDATED_AT=2026-05-17T00:00:00.000Z
```

## Azure VNet Peering Evidence

Set these after both peering directions are connected and private-IP
reachability is validated:

```bash
export GREYBOX_AZURE_VNET_PEERING_ID=greybox-to-customer
export GREYBOX_AZURE_VNET_CUSTOMER_NETWORK_ID=/subscriptions/customer/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/customer-vnet
export GREYBOX_AZURE_VNET_GREYBOX_NETWORK_ID=/subscriptions/greybox/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/greybox-vnet
export GREYBOX_AZURE_VNET_CIDR_NON_OVERLAP=true
export GREYBOX_AZURE_VNET_BIDIRECTIONAL_CONNECTED=true
export GREYBOX_AZURE_VNET_NSG_RULES_SCOPED=true
export GREYBOX_AZURE_VNET_PRIVATE_DNS_CONFIGURED=true
export GREYBOX_AZURE_VNET_LAST_VALIDATED_AT=2026-05-17T00:00:00.000Z
```

For multiple customers, replace the single-profile env vars with
`GREYBOX_PRIVATE_NETWORKS_JSON`.

## Official Reference Pointers

- AWS VPC peering:
  https://docs.aws.amazon.com/vpc/latest/peering/working-with-vpc-peering.html
- AWS VPC peering basics:
  https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html
- Azure virtual network peering:
  https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-peering-overview
- Azure peering setup and constraints:
  https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-manage-peering

## Evidence

- `src/enterprise/privateNetworkReadiness.ts` builds the readiness register.
- `tests/private-network-readiness.test.ts` verifies AWS/Azure pass, failure,
  JSON override, filtering, admin protection, and secret minimization.
