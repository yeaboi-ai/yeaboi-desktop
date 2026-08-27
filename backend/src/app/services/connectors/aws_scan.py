"""AWS scan connector — discovers active services and runs per-category AI analysis.

Scans an AWS account by combining Cost Explorer service discovery with a fixed
list of common free-tier services, fetches resource inventories via boto3, runs
per-category AI analysis, and writes DirectoryEntry records into the team directory.
"""

import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.integration import OrgIntegration
from ...services.ai_provider import get_ai_client
from ...services.crypto import decrypt_api_key
from .prompting import system_prompt
from .scan_runner import ScanRunner

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cost Explorer name → normalized service key
# ---------------------------------------------------------------------------

_COST_NAME_MAP: dict[str, str] = {
    "Amazon Elastic Compute Cloud - Compute": "ec2",
    "Amazon Simple Storage Service": "s3",
    "Amazon Relational Database Service": "rds",
    "AWS Lambda": "lambda",
    "Amazon Elastic Container Service": "ecs",
    "Amazon CloudFront": "cloudfront",
    "AWS Identity and Access Management": "iam",
    "Amazon API Gateway": "apigateway",
    "Amazon Simple Queue Service": "sqs",
    "Amazon Simple Notification Service": "sns",
    "Amazon DynamoDB": "dynamodb",
    "AmazonCloudWatch": "cloudwatch",
    "Amazon CloudWatch": "cloudwatch",
    "Amazon Elastic Load Balancing": "elb",
    "Amazon Route 53": "route53",
    "AWS Key Management Service": "kms",
    "AWS CloudFormation": "cloudformation",
    "Amazon Elastic Container Registry": "ecr",
    "Amazon ElastiCache": "elasticache",
    "Amazon Elastic File System": "efs",
}

# Services that may not appear in Cost Explorer (free tier, always-on, etc.)
_FIXED_COMMON_SERVICES: set[str] = {"s3", "lambda", "iam", "cloudwatch", "sns", "sqs"}

# ---------------------------------------------------------------------------
# Category prompt templates
# ---------------------------------------------------------------------------

CATEGORY_PROMPTS: dict[str, str] = {
    "infrastructure": (
        "Analyze this AWS account's infrastructure. Cover: compute, databases, storage, "
        "networking, deployment patterns, region strategy. Concise markdown (200-400 words)."
    ),
    "costs": (
        "Analyze this AWS account's cost data. Cover: monthly spend by service, cost trends, "
        "largest cost drivers, potential savings. Concise markdown (200-300 words)."
    ),
    "security": (
        "Analyze this AWS account's security posture. Cover: IAM roles, public endpoints, "
        "encryption status, recommendations. Concise markdown (200-300 words)."
    ),
    "services": (
        "List and describe each active AWS service. For each: what it does, key configuration, "
        "relationships. Concise markdown (200-400 words)."
    ),
    "overview": (
        "Concise overview of this AWS account (150-250 words). Services, regions, monthly cost, "
        "primary use case. For team directory."
    ),
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _merge_active_services(cost_services: set[str], fixed_services: set[str]) -> set[str]:
    """Merge cost-discovered service names with a fixed list of common services.

    Cost Explorer names (e.g. "Amazon Elastic Compute Cloud - Compute") are
    normalised to short keys (e.g. "ec2") via ``_COST_NAME_MAP``.  Unknown
    cost names are lowered and stripped for a best-effort key.

    Args:
        cost_services: Raw service names from Cost Explorer ``GetCostAndUsage``.
        fixed_services: Pre-defined set of normalised service keys.

    Returns:
        Merged set of normalised service keys.
    """
    normalised: set[str] = set(fixed_services)

    for name in cost_services:
        key = _COST_NAME_MAP.get(name)
        if key:
            normalised.add(key)
        else:
            # Best-effort: lowercase, strip "Amazon " / "AWS " prefix, replace spaces
            fallback = name.lower().replace("amazon ", "").replace("aws ", "").strip()
            fallback = fallback.replace(" ", "_")
            if fallback:
                normalised.add(fallback)

    return normalised


def _build_inventory_prompt(category: str, inventory: dict, region: str) -> str:
    """Build an AI analysis prompt from service inventory data.

    Each service's data is JSON-serialised (truncated to 2000 chars).
    Region context and category-specific instructions are prepended.

    Args:
        category: One of the ``CATEGORY_PROMPTS`` keys.
        inventory: Mapping of service key -> fetched resource data.
        region: AWS region the account is configured for.

    Returns:
        Complete prompt string.
    """
    instruction = CATEGORY_PROMPTS.get(category, CATEGORY_PROMPTS["overview"])

    parts = [
        f"AWS Account — Region: {region}",
        "",
        instruction,
        "",
        "--- Service Inventory ---",
    ]

    for service_key, data in inventory.items():
        serialised = json.dumps(data, indent=2, default=str)
        truncated = serialised[:15000]
        if len(serialised) > 15000:
            truncated += "\n... (truncated)"
        parts.append(f"\n### {service_key}\n```json\n{truncated}\n```")

    parts.append("")
    parts.append(
        "When something stands out (e.g. unusually large cost line, public S3 "
        "bucket, unattached EIP, orphaned resource, missing encryption), call "
        "it out explicitly."
    )

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Service fetcher (sync — boto3 is sync)
# ---------------------------------------------------------------------------

# Maps service key → (boto3_client_name, method_name, response_key)
_SERVICE_FETCH_MAP: dict[str, tuple[str, str, str]] = {
    "ec2": ("ec2", "describe_instances", "Reservations"),
    "rds": ("rds", "describe_db_instances", "DBInstances"),
    "s3": ("s3", "list_buckets", "Buckets"),
    "lambda": ("lambda", "list_functions", "Functions"),
    "ecs": ("ecs", "list_clusters", "clusterArns"),
    "cloudfront": ("cloudfront", "list_distributions", "Items"),
    "iam": ("iam", "list_roles", "Roles"),
    "apigateway": ("apigateway", "get_rest_apis", "items"),
    "sqs": ("sqs", "list_queues", "QueueUrls"),
    "sns": ("sns", "list_topics", "Topics"),
    "dynamodb": ("dynamodb", "list_tables", "TableNames"),
    "cloudwatch": ("cloudwatch", "describe_alarms", "MetricAlarms"),
}


def _fetch_service(boto_session, service_key: str, region: str) -> list | dict | None:
    """Fetch resources for a single AWS service via boto3.

    Uses a mapping of service key to the appropriate boto3 client, method, and
    response key.  Returns ``None`` if the service key is unknown or the call
    fails.

    Args:
        boto_session: A ``boto3.Session`` instance.
        service_key: Normalised service key (e.g. ``"ec2"``).
        region: AWS region name.

    Returns:
        The extracted portion of the boto3 response, or ``None`` on failure.
    """
    spec = _SERVICE_FETCH_MAP.get(service_key)
    if spec is None:
        return None

    client_name, method_name, response_key = spec

    try:
        # IAM, CloudFront, and S3 are global services — no region needed
        if client_name in ("iam", "cloudfront", "s3"):
            client = boto_session.client(client_name)
        else:
            client = boto_session.client(client_name, region_name=region)

        method = getattr(client, method_name)
        response = method()

        # CloudFront nests under DistributionList → Items
        if service_key == "cloudfront":
            dist_list = response.get("DistributionList", {})
            return dist_list.get(response_key)

        return response.get(response_key)

    except Exception:
        logger.exception("Failed to fetch service %s in %s", service_key, region)
        return None


# ---------------------------------------------------------------------------
# Cost Explorer helper (sync)
# ---------------------------------------------------------------------------


def _fetch_cost_data(boto_session, region: str) -> tuple[set[str], dict | None]:
    """Query Cost Explorer for the last 30 days of spend by service.

    Cost Explorer is always queried in us-east-1 regardless of the configured
    region.

    Args:
        boto_session: A ``boto3.Session`` instance.
        region: The account's configured region (unused — CE is always us-east-1).

    Returns:
        Tuple of (set of service names, raw cost response or None on failure).
    """
    try:
        ce_client = boto_session.client("ce", region_name="us-east-1")

        end = datetime.utcnow().date()
        start = end - timedelta(days=30)

        response = ce_client.get_cost_and_usage(
            TimePeriod={
                "Start": start.isoformat(),
                "End": end.isoformat(),
            },
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )

        service_names: set[str] = set()
        for result_by_time in response.get("ResultsByTime", []):
            for group in result_by_time.get("Groups", []):
                keys = group.get("Keys", [])
                if keys:
                    service_names.add(keys[0])

        return service_names, response

    except Exception:
        logger.exception("Failed to fetch Cost Explorer data")
        return set(), None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def run(runner: ScanRunner, db: AsyncSession) -> None:
    """Main scan entry point: validate credentials, discover services, analyse.

    Decrypts AWS credentials from the integration record, validates via STS
    ``GetCallerIdentity``, runs Cost Explorer for the last 30 days, merges
    active services, fetches inventory per service, runs AI analysis for each
    category, and writes directory entries.

    Args:
        runner: Pre-configured ScanRunner instance.
        db: Active database session.
    """
    import boto3

    await runner.start(scan_type="full")

    try:
        # 1. Load integration and decrypt credentials
        result = await db.execute(select(OrgIntegration).where(OrgIntegration.id == runner.integration_id))
        integration = result.scalar_one_or_none()

        if not integration:
            await runner.fail("Integration not found")
            return

        if not integration.credentials:
            await runner.fail("No AWS credentials configured")
            return

        raw_creds = decrypt_api_key(integration.credentials)
        creds = json.loads(raw_creds)

        access_key_id = creds.get("access_key_id")
        secret_access_key = creds.get("secret_access_key")
        region = creds.get("region", "us-east-1")

        if not access_key_id or not secret_access_key:
            await runner.fail("AWS credentials incomplete — missing access_key_id or secret_access_key")
            return

        # 2. Create boto3 session and validate via STS
        boto_session = boto3.Session(
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name=region,
        )

        try:
            sts = boto_session.client("sts")
            identity = sts.get_caller_identity()
            account_id = identity.get("Account", "unknown")
            logger.info("Validated AWS identity: account=%s, arn=%s", account_id, identity.get("Arn"))
        except Exception as exc:
            await runner.fail(f"AWS STS validation failed: {exc}")
            return

        # 3. Discover active services via Cost Explorer
        cost_service_names, cost_response = _fetch_cost_data(boto_session, region)
        logger.info("Cost Explorer found %d services", len(cost_service_names))

        active_services = _merge_active_services(cost_service_names, _FIXED_COMMON_SERVICES)
        logger.info("Active services after merge: %s", sorted(active_services))

        # 4. Fetch inventory for each known service
        inventory: dict[str, list | dict] = {}

        for service_key in sorted(active_services):
            data = _fetch_service(boto_session, service_key, region)
            if data is not None:
                inventory[service_key] = data
                await runner.record_item(
                    resource_path=f"aws/{service_key}",
                    action="scanned",
                )

        # Include cost data in inventory for the costs category
        if cost_response:
            inventory["cost_explorer"] = cost_response

        if not inventory:
            logger.warning("No AWS inventory data collected, skipping AI analysis")
            await runner.complete()
            return

        # 5. Run AI analysis per category
        ai_client = await get_ai_client(runner.org_id, db, task="default")

        for category in CATEGORY_PROMPTS:
            prompt = _build_inventory_prompt(category, inventory, region)

            # Determine entry path
            if category == "costs":
                entry_path = "costs/aws-monthly"
            elif category == "overview":
                entry_path = "overview/aws"
            else:
                entry_path = f"{category}/aws"

            title = f"AWS — {category.title()}"

            try:
                analysis, tokens_used = await ai_client.chat_with_usage(
                    system=system_prompt("AWS", role="senior cloud architect"),
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=1500,
                )

                entry, action = await runner.upsert_entry(
                    path=entry_path,
                    title=title,
                    content=analysis,
                    category=category,
                    source_ref=f"aws:account:{account_id}",
                )

                await runner.record_item(
                    resource_path=f"aws/{category}",
                    action=action,
                    ai_model=ai_client.model,
                    tokens_used=tokens_used,
                    directory_entry_id=entry.id,
                )
                logger.info("Wrote entry %s for AWS account %s", entry_path, account_id)

            except Exception:
                logger.exception("AI analysis failed for AWS category %s", category)
                await runner.record_item(
                    resource_path=f"aws/{category}",
                    action="failed",
                    reason="AI analysis error",
                )

        await runner.complete()

    except Exception as exc:
        logger.exception("AWS scan failed")
        await runner.fail(str(exc))
